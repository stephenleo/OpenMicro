// Codex macOS desktop app harness (/Applications/Codex.app, AppleScript name
// "Codex", bundle com.openai.codex). GUI harness: no pty is spawned. Actions
// resolve to tagged strings that execute() turns into `open` deep links or
// System Events keystrokes into the frontmost Codex window.

import { execFile } from 'node:child_process'
import { installCodexHooks } from '../hooks-install.js'
import { codexHarness } from './codex.js'
import type { Action, AgentState, Harness } from './types.js'

// Terminal byte sequences with a System Events equivalent — lets the default
// layer's `keys` bindings (d-pad arrows, Shift+Tab clear/cycle, Ctrl+U) drive
// the app. Sequences without an entry resolve to null (no GUI meaning).
const KEY_EQUIVALENTS: Record<string, string> = {
  '\x1b[A': 'key code 126', // up arrow
  '\x1b[B': 'key code 125', // down arrow
  '\x1b[C': 'key code 124', // right arrow
  '\x1b[D': 'key code 123', // left arrow
  '\x1b[Z': 'key code 48 using shift down', // Shift+Tab
  '\x15': 'keystroke "u" using control down', // Ctrl+U — clear the input line
}

export const codexAppHarness: Harness = {
  kind: 'codex-app',
  usesPty: false,
  // No pty is spawned; instead the cli runs command+buildArgs once at startup
  // to launch/activate the app, mirroring how pty harnesses launch their CLI.
  command: 'open',
  buildArgs(): string[] {
    return ['-a', 'Codex']
  },

  installHooks() {
    // The desktop app shares ~/.codex with the CLI: if the app fires the
    // hooks.json lifecycle hooks, state feedback works for free; if it does
    // not, the tracker stays empty and LEDs degrade to the layer color.
    const result = installCodexHooks()
    return {
      changed: result === 'changed',
      trustNotice:
        result === 'changed'
          ? 'openmicro: Codex hooks changed — open /hooks in Codex and trust the openmicro hooks'
          : null,
    }
  },

  stateForHookEvent(event: string, payload: unknown): AgentState | null {
    // Same ~/.codex hook contract as the CLI — delegate the mapping.
    return codexHarness.stateForHookEvent(event, payload)
  },

  resolveAction(action: Action, _ctx: { thinkingLevel: number }) {
    switch (action.type) {
      case 'accept':
        return { bytes: 'osascript:keystroke return' }
      case 'push_to_talk':
        // Ctrl+Shift+D toggles dictation in the app (a toggle, not a hold).
        return { bytes: 'osascript:keystroke "d" using {control down, shift down}' }
      case 'new_chat':
        return { bytes: 'open:codex://new' }
      case 'prompt':
        // Deep link prefills the composer but does NOT auto-send — the user
        // follows with accept.
        return { bytes: 'open:codex://new?prompt=' + encodeURIComponent(action.text) }
      case 'reject':
        return { bytes: 'osascript:key code 53' } // Esc — stop generation / dismiss
      case 'thinking_depth':
        return null // documented gap: no reasoning-effort control in the app
      case 'keys': {
        const equivalent = KEY_EQUIVALENTS[action.bytes]
        return equivalent ? { bytes: `osascript:${equivalent}` } : null
      }
      default:
        return null // workflow/focus_session/layer never reach a harness
    }
  },

  execute(bytes: string): void {
    const sep = bytes.indexOf(':')
    if (sep < 0) return // untagged bytes (e.g. a raw '\x03') have no GUI meaning
    const tag = bytes.slice(0, sep)
    const payload = bytes.slice(sep + 1)
    // Fire-and-forget like src/herdr.ts; arg arrays only, never a shell string
    // (prompt text must not be shell-interpretable).
    if (tag === 'open') {
      execFile('open', [payload], () => {})
    } else if (tag === 'osascript') {
      // System Events keystrokes require the terminal to have Accessibility /
      // Automation permission (System Settings → Privacy & Security).
      execFile(
        'osascript',
        [
          '-e',
          'tell application "Codex" to activate',
          '-e',
          `tell application "System Events" to ${payload}`,
        ],
        () => {},
      )
    }
  },
}
