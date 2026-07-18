// Action dispatch: turn a routed Action into a side effect. Kept free of HID,
// pty, and timer wiring so it is unit-testable — the cli injects the effect
// closures (write / focusSession / setLayer / thinking-level accessors) and the
// per-button repeat handling.
//
// focus_session, layer, and herdr_space are core-only actions (never reach a Harness).
// workflow resolves its preset text through the config, then hands the harness
// a plain prompt. Everything else goes straight to the harness's resolveAction;
// a null result is a documented gap (e.g. Codex has no push-to-talk) and is
// silently skipped, never faked.

import type { Action, Harness } from './harness/types.js'
import type { OpenMicroConfig } from './layers.js'

export interface DispatchDeps {
  harness: Harness
  config: OpenMicroConfig
  /** Thinking level (0-based) of the currently focused session. */
  getThinkingLevel: () => number
  /** Persist a new thinking level for the focused session. */
  setThinkingLevel: (level: number) => void
  /** Write bytes to the focused session (local pty or remote instance). */
  write: (bytes: string) => void
  /** Change focus: index -1 = cycle to next tracked session, else jump to slot. */
  focusSession: (index: number) => void
  /** Switch the active layer (bound `{ type: 'layer' }` action). */
  setLayer: (index: number) => void
  /** Cycle the selected herdr workspace (bound `{ type: 'herdr_space' }` action). */
  cycleHerdrSpace: () => void
}

/**
 * Execute a routed Action against the injected effect closures.
 *
 * Args:
 *     action (Action): The action produced by LayerRouter.route.
 *     deps (DispatchDeps): Injected effect closures + harness/config context.
 *
 * Returns:
 *     None.
 */
export function dispatchAction(action: Action, deps: DispatchDeps): void {
  // GUI harnesses have no panes or herdr workspaces to cycle: focus_session
  // and herdr_space fall through to the harness, which maps them to an in-app
  // equivalent (e.g. next chat / next window) or null.
  const gui = deps.harness.usesPty === false
  switch (action.type) {
    case 'focus_session':
      if (!gui) {
        deps.focusSession(action.index)
        return
      }
      break
    case 'layer':
      deps.setLayer(action.index)
      return
    case 'herdr_space':
      if (!gui) {
        deps.cycleHerdrSpace()
        return
      }
      break
    case 'workflow': {
      const text = deps.config.workflows[action.presetId]
      if (text === undefined) return // unknown preset — nothing to send
      const resolved = deps.harness.resolveAction(
        { type: 'prompt', text },
        { thinkingLevel: deps.getThinkingLevel() },
      )
      if (resolved) deps.write(resolved.bytes)
      return
    }
    default:
      break
  }
  const resolved = deps.harness.resolveAction(action, {
    thinkingLevel: deps.getThinkingLevel(),
  })
  if (!resolved) return // documented gap for this harness
  if (resolved.thinkingLevel !== undefined) deps.setThinkingLevel(resolved.thinkingLevel)
  deps.write(resolved.bytes)
}
