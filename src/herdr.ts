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

// herdr drops report/release requests whose seq is not strictly greater than
// the last seq it saw for the pane — and a request with no --seq defaults to
// 0, so it is ALWAYS dropped (herdr still replies ok / exits 0). Mirror
// herdr's own integration hook: epoch-nanosecond seq, bumped if two calls
// land in the same millisecond.
let lastSeq = 0n

function nextSeq(): string {
  const now = BigInt(Date.now()) * 1_000_000n
  lastSeq = now > lastSeq ? now : lastSeq + 1n
  return lastSeq.toString()
}

function run(args: string[]): void {
  try {
    // Errors (ENOENT, non-zero exit) land in the callback and are ignored.
    execFile('herdr', args, () => {})
  } catch {
    // Synchronous spawn failure — never block openmicro on herdr.
  }
}

function runJson(args: string[]): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      execFile('herdr', args, (err, stdout) => {
        if (err) return resolve(null)
        try {
          resolve(JSON.parse(String(stdout)))
        } catch {
          resolve(null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

export interface HerdrWorkspace {
  workspace_id: string
  label?: string
}

export interface HerdrAgent {
  workspace_id: string
  /** Focusable target for `herdr agent focus` (terminal id). */
  terminal_id: string
  /** Herdr pane hosting the agent — matches the X-Herdr-Pane-Id hook header. */
  pane_id: string
  /** True for the pane currently focused in the herdr UI. */
  focused?: boolean
}

/**
 * List herdr workspaces.
 *
 * Returns:
 *     Promise<HerdrWorkspace[]>: Workspaces, or [] on any failure (herdr missing, bad JSON, nonzero exit).
 */
export async function listWorkspaces(): Promise<HerdrWorkspace[]> {
  const parsed = (await runJson(['workspace', 'list'])) as {
    result?: { workspaces?: unknown }
  } | null
  const workspaces = parsed?.result?.workspaces
  return Array.isArray(workspaces) ? (workspaces as HerdrWorkspace[]) : []
}

/**
 * Focus a herdr workspace.
 *
 * Args:
 *     id (string): Herdr workspace id.
 *
 * Returns:
 *     Promise<void>: Resolves silently even on failure.
 */
export async function focusWorkspace(id: string): Promise<void> {
  await runJson(['workspace', 'focus', id])
}

/**
 * List herdr agents across all workspaces.
 *
 * Returns:
 *     Promise<HerdrAgent[]>: Agents, or [] on any failure (herdr missing, bad JSON, nonzero exit).
 */
export async function listAgents(): Promise<HerdrAgent[]> {
  const parsed = (await runJson(['agent', 'list'])) as { result?: { agents?: unknown } } | null
  const agents = parsed?.result?.agents
  return Array.isArray(agents) ? (agents as HerdrAgent[]) : []
}

/**
 * Focus a herdr agent's terminal.
 *
 * Args:
 *     target (string): Focusable target (terminal id) from listAgents.
 *
 * Returns:
 *     Promise<void>: Resolves silently even on failure.
 */
export async function focusAgent(target: string): Promise<void> {
  await runJson(['agent', 'focus', target])
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
    '--seq',
    nextSeq(),
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
  run(['pane', 'release-agent', paneId, '--source', SOURCE, '--agent', AGENT, '--seq', nextSeq()])
}
