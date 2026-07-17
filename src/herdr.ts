// Fire-and-forget bridge to herdr (terminal workspace manager). When a wrapped
// agent runs inside a herdr-managed pane, herdr injects HERDR_PANE_ID into the
// pane's environment; the pty passes it through to the agent, hook curl
// commands echo it back as the X-Herdr-Pane-Id header, and the host mirrors
// the classified state to herdr here. herdr not installed = silent no-op —
// this module must never block or throw.

import { execFile } from 'node:child_process'
import type { AgentState } from './harness/types.js'

const SOURCE = 'openmicro'
const AGENT = 'openmicro'

type HerdrState = 'idle' | 'working' | 'blocked'

const STATE_MAP: Record<AgentState, HerdrState> = {
  executing: 'working',
  waiting: 'blocked',
  error: 'blocked',
  idle: 'idle',
  complete: 'idle',
}

function run(args: string[]): void {
  try {
    // Errors (ENOENT, non-zero exit) land in the callback and are ignored.
    execFile('herdr', args, () => {})
  } catch {
    // Synchronous spawn failure — never block openmicro on herdr.
  }
}

/**
 * Mirror a classified agent state to the herdr pane hosting the session.
 *
 * Args:
 *     paneId (string): Herdr pane id from the X-Herdr-Pane-Id hook header.
 *     state (AgentState): Harness-classified state (mapped to herdr's idle/working/blocked).
 *     sessionId (string | undefined): Hook session id, forwarded as --agent-session-id.
 *
 * Returns:
 *     void: Fire-and-forget; all failures are swallowed.
 */
export function reportAgentState(paneId: string, state: AgentState, sessionId?: string): void {
  const args = [
    'pane',
    'report-agent',
    paneId,
    '--source',
    SOURCE,
    '--agent',
    AGENT,
    '--state',
    STATE_MAP[state],
  ]
  if (sessionId) args.push('--agent-session-id', sessionId)
  run(args)
}

/**
 * Release openmicro's agent claim on a herdr pane (session ended).
 *
 * Args:
 *     paneId (string): Herdr pane id from the X-Herdr-Pane-Id hook header.
 *
 * Returns:
 *     void: Fire-and-forget; all failures are swallowed.
 */
export function releaseAgent(paneId: string): void {
  run(['pane', 'release-agent', paneId, '--source', SOURCE, '--agent', AGENT])
}
