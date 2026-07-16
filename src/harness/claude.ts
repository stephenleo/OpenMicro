// Claude Code harness. Every keybinding below is verified against the real CLI
// (v2.1.211) and the official docs at https://code.claude.com/docs/en/interactive-mode
// (keyboard shortcuts) and .../commands (slash commands). Nothing is guessed.

import { installClaudeHooks } from '../hooks-install.js'
import type { Action, AgentState, Harness } from './types.js'

// `claude --help` exposes `--effort <low|medium|high|xhigh|max>`, and the
// verified live control is the `/effort <level>` slash command, which "takes
// effect immediately" (docs, /commands). These are the pure reasoning-depth
// steps in ascending order; the dial's thinkingLevel indexes into them.
// ponytail: `ultracode` also exists but bundles multi-agent orchestration, not
// a plain depth step — left out on purpose. Add it if a 6th dial notch is wanted.
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** Extract a human-readable message from an arbitrary hook payload, if present. */
function messageOf(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const msg = (payload as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return ''
}

export const claudeHarness: Harness = {
  kind: 'claude',
  command: 'claude',

  buildArgs(userArgs: string[]): string[] {
    return userArgs
  },

  installHooks() {
    const result = installClaudeHooks()
    return { changed: result === 'changed', trustNotice: null }
  },

  stateForHookEvent(event: string, payload: unknown): AgentState | null {
    switch (event) {
      case 'UserPromptSubmit':
      case 'PostToolUse': // a tool finished — resuming after question answers / permission grants
        return 'executing'
      case 'Stop':
        return 'complete' // transient green; SessionTracker decays it to idle
      case 'Notification':
        // ponytail: best-effort error heuristic. Hooks carry no ground-truth
        // error signal, so we sniff the notification text. Upgrade path: a real
        // error hook event if Claude Code ever ships one.
        return /error|failed|denied/i.test(messageOf(payload)) ? 'error' : 'waiting'
      case 'PreToolUse': // installed with matcher AskUserQuestion only
        return 'waiting'
      default:
        return null // SessionEnd (caller removes) + unknown/future events
    }
  },

  resolveAction(action: Action, ctx: { thinkingLevel: number }) {
    switch (action.type) {
      case 'accept':
        return { bytes: '\r' } // Enter submits the prompt / accepts the highlighted dialog option
      case 'reject':
        return { bytes: '\x1b' } // Esc interrupts Claude / closes a dialog
      case 'push_to_talk':
        return { bytes: ' ' } // Space = hold-to-dictate (docs "Voice input", requires voice dictation enabled)
      case 'new_chat':
        return { bytes: '/clear\r' } // /clear starts a new conversation with empty context
      case 'thinking_depth': {
        const next = Math.max(
          0,
          Math.min(EFFORT_LEVELS.length - 1, ctx.thinkingLevel + action.delta),
        )
        return { bytes: `/effort ${EFFORT_LEVELS[next]}\r`, thinkingLevel: next }
      }
      case 'prompt':
        return { bytes: action.text + '\r' }
      case 'keys':
        return { bytes: action.bytes }
      default:
        return null // workflow/focus_session/layer never reach a harness
    }
  },
}
