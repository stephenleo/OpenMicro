// Stub: Phase 1 only needs AgentState for feedback.ts. Phase 2 owns the full
// harness contract (AgentKind, Action, Harness, harnessFor, ...) and extends
// this file rather than replacing it.

export type AgentState = 'executing' | 'waiting' | 'idle' | 'complete' | 'error'
