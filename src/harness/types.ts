// The harness contract — the only place agent-specific knowledge lives. Core
// modules import these types and never the `'claude'`/`'codex'` literals.

// `(string & {})` keeps 'claude'/'codex' autocompleting while still accepting
// any third-party kind — a Harness with a novel `kind` compiles without a cast.
export type AgentKind = 'claude' | 'codex' | (string & {})
export type AgentState = 'executing' | 'waiting' | 'idle' | 'complete' | 'error'

export type Action =
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'push_to_talk'; pressed?: boolean } // pressed set by the cli for GUI hold-to-talk (true = button down, false = up); absent for pty toggle harnesses
  | { type: 'new_chat' }
  | { type: 'thinking_depth'; delta: 1 | -1 }
  | { type: 'workflow'; presetId: string } // core resolves presetId → text via config, then calls resolveAction({type:'prompt', text})
  | { type: 'prompt'; text: string }
  | { type: 'focus_session'; index: number } // core-handled for pty harnesses; GUI harnesses map it to an in-app equivalent
  | { type: 'layer'; index: number } // handled by core, never reaches a Harness
  | { type: 'herdr_space' } // cycle herdr workspaces; core-handled for pty harnesses, in-app equivalent for GUI ones
  | { type: 'keys'; bytes: string } // raw pty passthrough (e.g. dpad arrows), user-remappable

export interface InstallResult {
  changed: boolean
  trustNotice: string | null
}

export interface Harness {
  readonly kind: AgentKind
  readonly command: string
  /** Absent = true. False = GUI harness: no pty is spawned; resolved bytes go to execute() instead of a pty write. */
  readonly usesPty?: boolean
  buildArgs(userArgs: string[]): string[]
  installHooks(): InstallResult
  /** Hook event name + raw payload → state, null if not state-relevant. Error/complete are best-effort heuristics per harness. */
  stateForHookEvent(event: string, payload: unknown): AgentState | null
  /** Action → pty bytes (+ new thinking level when applicable). null = harness has no equivalent (documented gap, never faked). */
  resolveAction(
    action: Action,
    ctx: { thinkingLevel: number },
  ): { bytes: string; thinkingLevel?: number } | null
  /** Side-effect runner for usesPty:false harnesses — the cli calls it with resolveAction's bytes in place of a pty write. */
  execute?(bytes: string): void
  /** Shutdown cleanup for usesPty:false harnesses — must undo any lingering system side effects (e.g. release synthetic keys still held down). */
  dispose?(): void
}
