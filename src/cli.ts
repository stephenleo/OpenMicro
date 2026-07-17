#!/usr/bin/env node
// openmicro — wrap an AI agent CLI in a pty and drive it with a game controller.
// Usage: openmicro [claude|codex] [...agent args]   (claude is the default)
//
// The first instance to bind the singleton port becomes the HOST: it owns the
// controller and aggregates agent state across every session. Later instances
// run as CLIENTS — their session still reports state via hooks, and the host
// forwards terminal keystrokes to whichever session has focus.

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isOpenmicroHost, runAsClient } from './client.js'
import { HidManager } from './controller/hid-manager.js'
import { dispatchAction } from './dispatch.js'
import type { DispatchDeps } from './dispatch.js'
import { harnessFor } from './harness/index.js'
import {
  focusAgent,
  focusWorkspace,
  listAgents,
  listWorkspaces,
  releaseAgent,
  reportAgentState,
} from './herdr.js'
import type { Harness } from './harness/types.js'
import { parseInvocation, USAGE } from './invocation.js'
import { loadConfig } from './layers.js'
import type { OpenMicroConfig } from './layers.js'
import { effectiveFocusIndex, feedbackFor } from './feedback.js'
import type { RGB } from './feedback.js'
import { KeyRepeater } from './keymap.js'
import { logger } from './logger.js'
import { HOST_PORT } from './ports.js'
import { AgentPty } from './pty.js'
import { LayerRouter } from './router.js'
import { HostServer } from './server.js'
import { nextFocus } from './state.js'
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
if (invocation.version) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  console.log(pkg.version)
  process.exit(0)
}

// `doctor` is standalone: no agent wrapped, no host server. Run it and exit
// before any of the host/client wiring below. Dynamically imported so its HID
// + readline machinery never loads for a normal wrap.
if (invocation.doctor) {
  const { runDoctor } = await import('./doctor.js')
  await runDoctor()
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

// Claim the herdr pane NOW, before the wrapped agent boots: herdr honors the
// first source to claim a pane and silently drops every later one, so the
// agent's own herdr integration hook (e.g. herdr:claude at SessionStart) would
// otherwise win the pane and all of openmicro's state reports would be ignored.
const herdrPaneId = process.env.HERDR_PANE_ID
if (herdrPaneId) reportAgentState(herdrPaneId, 'idle')

const server = new HostServer(harness, wrapperId)
const isHost = await server.listen(HOST_PORT)

let hid: HidManager | null = null

function shutdown(): void {
  agent.dispose()
  if (herdrPaneId) releaseAgent(herdrPaneId)
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
  let herdrWorkspaceId: string | null = null // null = local mode (no herdr space selected)
  let herdrAgentTarget: string | null = null // last-focused agent terminal within the space

  let feedbackTimer: ReturnType<typeof setTimeout> | null = null
  let flashUntil = 0
  let flashColor: RGB | null = null

  const focusKey = (): string => focusSessionId ?? SELF_SESSION_KEY

  /** Session hosted in a herdr pane, or null when the pane runs no openmicro session. */
  function sessionForPane(paneId: string): string | null {
    for (const [sessionId, herdrPane] of server.sessionPanes) {
      if (herdrPane === paneId) return sessionId
    }
    return null
  }

  // True while herdr focus sits on a pane hosting no openmicro session (a
  // plain terminal, a foreign agent, an empty space). Input is dropped rather
  // than falling through to some pane the user isn't looking at.
  let herdrForeignFocus = false

  /** Terminal writes go to the focused session's instance, else our own pty. */
  function writeToFocused(bytes: string): void {
    if (herdrForeignFocus) return // typing into an invisible pane is worse than a no-op
    const instanceId = focusSessionId ? server.instanceForSession(focusSessionId) : null
    if (!instanceId || !server.sendKeysToInstance(instanceId, bytes)) agent.write(bytes)
  }

  /** L2: walk [none, ws1, …, wsN] (wrapping); selecting a workspace focuses it in herdr. */
  async function cycleHerdrSpace(): Promise<void> {
    const ids = (await listWorkspaces()).map((w) => w.workspace_id)
    const current = herdrWorkspaceId === null ? -1 : ids.indexOf(herdrWorkspaceId)
    herdrWorkspaceId = ids[current + 1] ?? null // past the end (or vanished ws) → local mode
    herdrAgentTarget = null
    if (herdrWorkspaceId) {
      await focusWorkspace(herdrWorkspaceId)
      // Entering a space must also retarget voice/keys, else writeToFocused
      // keeps sending to the previously-focused session in another space.
      await cycleHerdrAgent()
    } else {
      herdrForeignFocus = false // back to local mode: explicit pick, unblock input
    }
  }

  /** Touchpad while a herdr space is selected: cycle the space's agents in herdr. */
  async function cycleHerdrAgent(): Promise<void> {
    const agents = (await listAgents()).filter((a) => a.workspace_id === herdrWorkspaceId)
    if (agents.length === 0) {
      // Empty space: keeping the old focus would spill voice into another space.
      focusSessionId = null
      herdrForeignFocus = true
      scheduleFeedback()
      return
    }
    const current = agents.findIndex((a) => a.terminal_id === herdrAgentTarget)
    const next = agents[(current + 1) % agents.length]!
    herdrAgentTarget = next.terminal_id
    void focusAgent(next.terminal_id)
    // Voice/keys must follow the herdr pick: retarget input routing to the
    // session hosted in that pane. No session in that pane (foreign agent) →
    // clear focus rather than keep spilling into a stale session elsewhere.
    focusSessionId = sessionForPane(next.pane_id)
    herdrForeignFocus = focusSessionId === null
    scheduleFeedback()
  }

  // Mouse clicks on herdr panes/spaces change focus entirely inside herdr —
  // no controller event fires. Poll the focused herdr agent and retarget
  // voice/keys routing whenever it moves.
  const HERDR_FOCUS_POLL_MS = 1000
  let lastHerdrFocusPane: string | null = null

  async function syncHerdrFocus(): Promise<void> {
    if (!herdrPaneId && server.sessionPanes.size === 0) return // no herdr in play
    const focused = (await listAgents()).find((a) => a.focused)
    const pane = focused?.pane_id ?? null // null = focused pane hosts no agent
    if (pane === lastHerdrFocusPane) return // edge-triggered: only act on change
    lastHerdrFocusPane = pane
    if (!focused) {
      // A plain (non-agent) pane took focus: block input instead of routing
      // voice/keys into a pane the user isn't looking at.
      focusSessionId = null
      herdrForeignFocus = true
      scheduleFeedback()
      return
    }
    herdrWorkspaceId = focused.workspace_id
    herdrAgentTarget = focused.terminal_id
    focusSessionId = sessionForPane(focused.pane_id)
    herdrForeignFocus = focusSessionId === null
    scheduleFeedback()
  }

  setInterval(() => {
    syncHerdrFocus().catch((err) => logger.warn('herdr focus sync failed', err))
  }, HERDR_FOCUS_POLL_MS).unref?.()

  /** Change focus: index -1 cycles to the next tracked session, else jumps to a slot. */
  function focusSession(index: number): void {
    if (herdrWorkspaceId !== null && index < 0) {
      void cycleHerdrAgent()
      return
    }
    const sessions = server.tracker.list()
    if (sessions.length === 0) return
    herdrForeignFocus = false // explicit local pick overrides the herdr block
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
    const focusedIndex = effectiveFocusIndex(
      sessions,
      focusSessionId,
      server.tracker.aggregate().focusSessionId,
    )
    const layerColor = config.layers[router.currentLayer]?.color ?? { r: 0, g: 0, b: 0 }
    const fb = feedbackFor(sessions, focusedIndex, layerColor)
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
    cycleHerdrSpace: () => void cycleHerdrSpace(),
  }

  let lastAttentionId: string | null = null
  server.on('aggregate', (agg: Aggregate) => {
    const next = nextFocus(focusSessionId, lastAttentionId, agg)
    lastAttentionId = next.lastAttentionId
    // While herdr governs focus (space selected or foreign pane focused),
    // attention must not steal it — voice would silently reroute to a pane
    // the user isn't looking at, fighting the mouse-click focus sync.
    if (herdrWorkspaceId === null && !herdrForeignFocus) focusSessionId = next.focus
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
