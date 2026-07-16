// Agent state tracking. Each agent session (keyed by hook session_id) has a
// tiny FSM; the aggregate across all sessions drives controller routing.
//
// State classification now lives behind the Harness (stateForHookEvent), so
// callers pass an already-classified AgentState here rather than a raw event
// name. `complete` is transient — it decays to `idle` after COMPLETE_DECAY_MS
// so the green "just finished" flash fades on its own. Pure apart from the
// optional decay timer, which is injectable for tests.

import type { AgentState } from './harness/types.js'

const COMPLETE_DECAY_MS = 8000

export interface Aggregate {
  /** True when someone is executing and nobody needs the user. */
  playing: boolean
  /** Session that most recently needs attention / stopped — terminal input routes here. */
  focusSessionId: string | null
}

export interface SessionApplyOptions {
  /** Allow a resting (idle/complete) session to take focus when nobody is executing or waiting. */
  focusOnStop?: boolean
}

interface Session {
  state: AgentState
  order: number
  focusOnStop: boolean
  completeAt: number | null
}

export interface SessionTrackerOptions {
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number
  /** Called when a background decay flips a `complete` session to `idle`. Wiring this enables the decay timer. */
  onChange?: () => void
}

export class SessionTracker {
  private sessions = new Map<string, Session>()
  private order = 0
  private readonly now: () => number
  private readonly onChange: (() => void) | null

  constructor(options: SessionTrackerOptions = {}) {
    this.now = options.now ?? Date.now
    this.onChange = options.onChange ?? null
  }

  /**
   * Apply a harness-classified state for a session.
   *
   * Args:
   *     sessionId (string): Hook session id.
   *     state (AgentState): State from harness.stateForHookEvent.
   *     options (SessionApplyOptions): Per-apply flags.
   *
   * Returns:
   *     boolean: True (the aggregate may have changed).
   */
  apply(sessionId: string, state: AgentState, options: SessionApplyOptions = {}): boolean {
    this.sessions.set(sessionId, {
      state,
      order: ++this.order,
      focusOnStop: options.focusOnStop === true,
      completeAt: state === 'complete' ? this.now() : null,
    })
    // Only arm the real timer when a change sink is wired (production). Tests
    // drive decay() manually against an injected clock, no timers involved.
    if (state === 'complete' && this.onChange) {
      setTimeout(() => {
        if (this.decay()) this.onChange?.()
      }, COMPLETE_DECAY_MS).unref?.()
    }
    return true
  }

  /**
   * Ordered snapshot of every tracked session, oldest first — for feedback rendering.
   *
   * Returns:
   *     { id: string; state: AgentState }[]: Sessions in stable slot order.
   */
  list(): { id: string; state: AgentState }[] {
    return [...this.sessions.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, s]) => ({ id, state: s.state }))
  }

  /**
   * Remove a session (e.g. on SessionEnd) so a dead waiter cannot pause forever.
   *
   * Args:
   *     sessionId (string): Hook session id.
   *
   * Returns:
   *     boolean: True if the session existed.
   */
  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  /**
   * Flip any `complete` session older than COMPLETE_DECAY_MS to `idle`.
   *
   * Returns:
   *     boolean: True if any session changed.
   */
  decay(): boolean {
    let changed = false
    const now = this.now()
    for (const [id, s] of this.sessions) {
      if (
        s.state === 'complete' &&
        s.completeAt !== null &&
        now - s.completeAt >= COMPLETE_DECAY_MS
      ) {
        this.sessions.set(id, { ...s, state: 'idle', completeAt: null })
        changed = true
      }
    }
    return changed
  }

  /**
   * Aggregate all sessions into the play/focus decision.
   *
   * Returns:
   *     Aggregate: playing + focusSessionId. `waiting`/`error` demand attention (pause + focus); `idle`/`complete` rest (focus only with focusOnStop); `executing` plays.
   */
  aggregate(): Aggregate {
    let attention: { id: string; order: number } | null = null
    let resting: { id: string; order: number } | null = null
    let anyExecuting = false
    for (const [id, s] of this.sessions) {
      if (
        (s.state === 'waiting' || s.state === 'error') &&
        (!attention || s.order > attention.order)
      ) {
        attention = { id, order: s.order }
      }
      if (
        (s.state === 'idle' || s.state === 'complete') &&
        s.focusOnStop &&
        (!resting || s.order > resting.order)
      ) {
        resting = { id, order: s.order }
      }
      if (s.state === 'executing') anyExecuting = true
    }
    return {
      playing: !attention && anyExecuting,
      focusSessionId: attention?.id ?? (anyExecuting ? null : resting?.id) ?? null,
    }
  }
}
