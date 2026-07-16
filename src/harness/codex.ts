// Codex CLI harness. Keybindings verified against the real CLI (codex-cli
// 0.144.4): slash commands read from the binary's command menu (`/new` =
// "start a new chat during a conversation", `/model` = "choose what model and
// reasoning effort to use") and the docs at https://learn.chatgpt.com/docs/codex/cli.
// Two actions have no verified deterministic binding and return null rather
// than faking bytes — see push_to_talk and thinking_depth below.

import { installCodexHooks } from '../hooks-install.js'
import type { Action, AgentState, Harness } from './types.js'

export const codexHarness: Harness = {
  kind: 'codex',
  command: 'codex',

  buildArgs(userArgs: string[]): string[] {
    return userArgs
  },

  installHooks() {
    const result = installCodexHooks()
    // Codex trust is definition-hash based: a changed hooks.json must be re-trusted.
    return {
      changed: result === 'changed',
      trustNotice:
        result === 'changed'
          ? 'open-micro: Codex hooks changed — open /hooks in Codex and trust the open-micro hooks'
          : null,
    }
  },

  stateForHookEvent(event: string, _payload: unknown): AgentState | null {
    switch (event) {
      case 'UserPromptSubmit':
      case 'PostToolUse':
        return 'executing'
      case 'PermissionRequest':
        return 'waiting'
      case 'Stop':
        return 'complete' // transient green; SessionTracker decays it to idle
      default:
        return null
    }
    // ponytail: no 'error' branch. Codex ships no error hook event, so there is
    // no signal to map. Upgrade path: sniff a future error event if one lands.
  },

  resolveAction(action: Action, _ctx: { thinkingLevel: number }) {
    switch (action.type) {
      case 'accept':
        return { bytes: '\r' } // Enter submits
      case 'reject':
        return { bytes: '\x1b' } // Esc interrupts the running turn
      case 'new_chat':
        return { bytes: '/new\r' } // "start a new chat during a conversation"
      case 'prompt':
        return { bytes: action.text + '\r' }
      case 'keys':
        return { bytes: action.bytes }
      case 'push_to_talk':
        // Documented gap: Codex has no voice/push-to-talk feature. Never faked.
        return null
      case 'thinking_depth':
        // Documented gap: reasoning effort is only adjustable via the interactive
        // `/model` picker (left/right arrows). No deterministic per-step command
        // exists to map a ±1 dial delta onto, so we return null instead of
        // guessing arrow-key macros against a picker layout we can't verify.
        return null
      default:
        return null // workflow/focus_session/layer never reach a harness
    }
  },
}
