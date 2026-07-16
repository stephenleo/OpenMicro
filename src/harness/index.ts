// Public harness API + built-in registry. Exposed as `openmicro/harness` via
// the package exports map. Third-party harnesses (Gemini CLI, opencode, …)
// register at runtime without forking — hence AgentKind widens to `string` at
// this boundary.

import { claudeHarness } from './claude.js'
import { codexHarness } from './codex.js'
import type { Harness } from './types.js'

export type { Action, AgentKind, AgentState, Harness, InstallResult } from './types.js'

const registry = new Map<string, Harness>([
  [claudeHarness.kind, claudeHarness],
  [codexHarness.kind, codexHarness],
])

/**
 * Look up a harness by kind.
 *
 * Args:
 *     kind (string): Harness kind, e.g. 'claude' or 'codex'. Widened to string so third-party kinds resolve.
 *
 * Returns:
 *     Harness: The registered harness.
 *
 * Throws:
 *     Error: When no harness is registered for `kind`, listing the known kinds.
 */
export function harnessFor(kind: string): Harness {
  const harness = registry.get(kind)
  if (!harness) {
    const known = [...registry.keys()].join(', ')
    throw new Error(`openmicro: unknown harness '${kind}'. Known harnesses: ${known}`)
  }
  return harness
}

/**
 * Register (or override) a harness. Keyed by `harness.kind`.
 *
 * Args:
 *     harness (Harness): The harness to register.
 *
 * Returns:
 *     None.
 */
export function registerHarness(harness: Harness): void {
  registry.set(harness.kind, harness)
}
