#!/usr/bin/env node
// openmicro — wrap an AI agent CLI in a pty and drive it with a game controller.
// Usage: openmicro [claude|codex] [...agent args]   (claude is the default)
//
// The first instance to bind the singleton port becomes the HOST: it owns the
// controller and aggregates agent state across every session. Later instances
// run as CLIENTS — their session still reports state via hooks, and the host
// forwards terminal keystrokes to whichever session has focus.

import { randomUUID } from 'node:crypto'
import { isOpenmicroHost, runAsClient } from './client.js'
import { HidManager } from './controller/hid-manager.js'
import { dispatchAction } from './dispatch.js'
import type { DispatchDeps } from './dispatch.js'
import { harnessFor } from './harness/index.js'
import type { Harness } from './harness/types.js'
import { parseInvocation, USAGE } from './invocation.js'
import { loadConfig } from './layers.js'
import type { OpenMicroConfig } from './layers.js'
import { feedbackFor } from './feedback.js'
import type { RGB } from './feedback.js'
import { KeyRepeater } from './keymap.js'
import { logger } from './logger.js'
import { HOST_PORT } from './ports.js'
import { AgentPty } from './pty.js'
import { LayerRouter } from './router.js'
import { HostServer } from './server.js'
import type { Aggregate } from './state.js'
import type { ButtonId, ControllerEvent } from './types.js'

const DEFAULT_THINKING_LEVEL = 2 // 'high' — level 2 of Claude's 5 effort steps
const FEEDBACK_DEBOUNCE_MS = 50
const LAYER_FLASH_MS = 600
const SELF_SESSION_KEY = '__self__' // thinking-level key for the host's own pty
// Only the d-pad arrows auto-repeat while held (TUI menu navigation).
const REPEATING: ReadonlySet<ButtonId> = new Set([
  'dpad_up',
  'dpad_down',
  'dpad_left',
  'dpad_right',
])

const invocation = parseInvocation(process.argv.slice(2))
if (invocation.help) {
  console.log(USAGE)
  process.exit(0)
}

let harness: Harness
try {
  harness = harnessFor(invocation.kind)
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

let config: OpenMicroConfig
try {
  config = loadConfig()
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

const install = harness.installHooks()
if (install.trustNotice) console.error(install.trustNotice)

const wrapperId = randomUUID()

const server = new HostServer(harness, process.cwd(), wrapperId)
const isHost = await server.listen(HOST_PORT)

let hid: HidManager | null = null

function shutdown(): void {
  agent.dispose()
  if (isHost) {
    server.close()
    hid?.stop()
  }
}

const agent = new AgentPty(
  harness.command,
  harness.buildArgs(invocation.agentArgs),
  wrapperId,
  (code) => {
    shutdown()
    process.exit(code)
  },
)

// Ctrl+C passthrough: forward the interrupt to the child so it decides how to
// handle it (in raw mode the terminal already routes ^C straight to the pty;
// this covers a programmatic `kill -INT`). SIGTERM cleans up and exits.
process.on('SIGINT', () => agent.write('\x03'))
process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

if (!isHost) {
  // ── Client: another openmicro owns the controller + state aggregation. ──
  if (await isOpenmicroHost()) {
    runAsClient(wrapperId, invocation.kind, (bytes) => agent.write(bytes)).catch((err) =>
      logger.warn('client stream failed', err),
    )
  } else {
    logger.warn('singleton port in use by a non-openmicro process — running without controller')
  }
} else {
  // ── Host: controller + feedback + state aggregation. ────────────────────
  hid = new HidManager()
  const router = new LayerRouter(config)
  const repeater = new KeyRepeater()
  const thinkingLevels = new Map<string, number>()
  let focusSessionId: string | null = null

  let feedbackTimer: ReturnType<typeof setTimeout> | null = null
  let flashUntil = 0
  let flashColor: RGB | null = null

  const focusKey = (): string => focusSessionId ?? SELF_SESSION_KEY

  /** Terminal writes go to the focused session's instance, else our own pty. */
  function writeToFocused(bytes: string): void {
    const instanceId = focusSessionId ? server.instanceForSession(focusSessionId) : null
    if (!instanceId || !server.sendKeysToInstance(instanceId, bytes)) agent.write(bytes)
  }

  /** Change focus: index -1 cycles to the next tracked session, else jumps to a slot. */
  function focusSession(index: number): void {
    const sessions = server.tracker.list()
    if (sessions.length === 0) return
    if (index < 0) {
      const current = sessions.findIndex((s) => s.id === focusSessionId)
      const next = sessions[(current + 1) % sessions.length]
      if (next) focusSessionId = next.id
    } else {
      const target = sessions[index]
      if (target) focusSessionId = target.id
    }
    scheduleFeedback()
  }

  function applyFeedback(): void {
    const sessions = server.tracker.list()
    const snapshots = sessions.map((s) => ({ state: s.state }))
    const focusedIndex = focusSessionId ? sessions.findIndex((s) => s.id === focusSessionId) : -1
    const layerColor = config.layers[router.currentLayer]?.color ?? { r: 0, g: 0, b: 0 }
    const fb = feedbackFor(snapshots, focusedIndex, layerColor)
    const lightbar = Date.now() < flashUntil && flashColor ? flashColor : fb.lightbar
    hid?.output?.setLightbar(lightbar)
    hid?.output?.setPlayerLeds(fb.playerLeds)
  }

  function scheduleFeedback(): void {
    if (feedbackTimer) return
    feedbackTimer = setTimeout(() => {
      feedbackTimer = null
      applyFeedback()
    }, FEEDBACK_DEBOUNCE_MS)
  }

  // Layer flip: flash the new layer's tint on the lightbar, then let the next
  // apply restore the state color once the flash window elapses.
  router.onLayerChange = (index: number): void => {
    flashColor = config.layers[index]?.color ?? null
    flashUntil = Date.now() + LAYER_FLASH_MS
    applyFeedback()
    setTimeout(applyFeedback, LAYER_FLASH_MS).unref?.()
  }

  const deps: DispatchDeps = {
    harness,
    config,
    getThinkingLevel: () => thinkingLevels.get(focusKey()) ?? DEFAULT_THINKING_LEVEL,
    setThinkingLevel: (level) => thinkingLevels.set(focusKey(), level),
    write: writeToFocused,
    focusSession,
    setLayer: (index) => router.setLayer(index),
  }

  server.on('aggregate', (agg: Aggregate) => {
    // Sticky focus: when nobody needs attention, keep routing to the session
    // that last did instead of snapping back to the host's own pty.
    focusSessionId = agg.focusSessionId ?? focusSessionId
    scheduleFeedback()
  })

  hid.on('data', (e: ControllerEvent) => {
    try {
      if (e.kind === 'connected') {
        logger.info(`Controller connected: ${e.controllerType}`)
        scheduleFeedback()
        return
      }
      if (e.kind === 'disconnected') {
        repeater.releaseAll()
        return
      }
      const action = router.route(e)
      if (!action) return

      // Held d-pad arrows auto-repeat; every other control fires once on press.
      if (e.kind === 'button' && REPEATING.has(e.button) && action.type === 'keys') {
        if (e.pressed) repeater.press(e.button, () => dispatchAction(action, deps))
        else repeater.release(e.button)
        return
      }
      if (e.kind === 'button' && !e.pressed) return // press-only for non-repeating buttons
      dispatchAction(action, deps)
    } catch (err) {
      logger.error('controller event handling failed', err)
    }
  })

  hid.start() // HID absence is non-fatal — the manager polls until a pad appears
  applyFeedback() // seed the lightbar with the current layer color
}

logger.info(`openmicro started (${isHost ? 'host' : 'client'}, kind: ${invocation.kind})`)
