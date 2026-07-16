// The harness contract — the only place agent-specific knowledge lives. Core
// modules import these types and never the `'claude'`/`'codex'` literals.

export type AgentKind = 'claude' | 'codex'
export type AgentState = 'executing' | 'waiting' | 'idle' | 'complete' | 'error'

export type Action =
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'push_to_talk' }
  | { type: 'new_chat' }
  | { type: 'thinking_depth'; delta: 1 | -1 }
  | { type: 'workflow'; presetId: string } // core resolves presetId → text via config, then calls resolveAction({type:'prompt', text})
  | { type: 'prompt'; text: string }
  | { type: 'focus_session'; index: number } // handled by core, never reaches a Harness
  | { type: 'layer'; index: number } // handled by core, never reaches a Harness
  | { type: 'keys'; bytes: string } // raw pty passthrough (e.g. dpad arrows), user-remappable

export interface InstallResult {
  changed: boolean
  trustNotice: string | null
}

export interface Harness {
  readonly kind: AgentKind
  readonly command: string
  buildArgs(userArgs: string[]): string[]
  installHooks(): InstallResult
  /** Hook event name + raw payload → state, null if not state-relevant. Error/complete are best-effort heuristics per harness. */
  stateForHookEvent(event: string, payload: unknown): AgentState | null
  /** Action → pty bytes (+ new thinking level when applicable). null = harness has no equivalent (documented gap, never faked). */
  resolveAction(
    action: Action,
    ctx: { thinkingLevel: number },
  ): { bytes: string; thinkingLevel?: number } | null
}
