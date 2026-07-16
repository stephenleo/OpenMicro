// Host HTTP server on the singleton port. Receives agent lifecycle hook POSTs
// (/om-hook/<event>), classifies them into an AgentState via the harness that
// owns the reporting session, and forwards terminal keystrokes to client
// instances over SSE. No game/sidebar/static serving — openmicro drives a
// controller, not a browser tab.

import { EventEmitter } from 'node:events'
import http from 'node:http'
import { harnessFor } from './harness/index.js'
import type { Harness } from './harness/types.js'
import { logger } from './logger.js'
import { HOOK_PATH, HOST_URL } from './ports.js'
import { SessionTracker } from './state.js'

// Every wrapped agent's hooks carry this ownership header (the pty exports
// OPENMICRO_INSTANCE_ID to the agent, and hook commands run with the agent's
// env). Header-less hooks come from sessions openmicro never wrapped — cwd is
// ambiguous when several sessions share a directory, so they are ignored.
const INSTANCE_HEADER = 'x-openmicro-instance-id'

function sse(res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  // retry: a leftover client re-attaches to the new host fast after a restart.
  res.write('retry: 1000\n\n')
}

function send(res: http.ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => resolve(body))
    req.on('error', () => resolve(body))
  })
}

/**
 * Emits 'aggregate' (Aggregate) whenever hook events (or a background
 * complete→idle decay) may have changed the combined agent state.
 */
export class HostServer extends EventEmitter {
  readonly tracker: SessionTracker
  /** session_id → wrapper id, learned from hook ownership headers. */
  readonly sessionOwners = new Map<string, string>()
  /** Which harness classifies a wrapper's hooks, resolved from /register. */
  private wrapperHarness = new Map<string, Harness>()

  private server: http.Server | null = null
  private instances = new Map<
    string,
    { res: http.ServerResponse; cwd: string; wrapperId: string | null }
  >()
  private pendingInstances = new Map<string, { cwd: string; wrapperId: string | null }>()
  private nextInstanceId = 1

  /**
   * hostHarness classifies the host's own session's hooks (and any hook whose
   * wrapper we never saw a /register for). hostWrapperId scopes which sessions
   * are trusted to drive the FSM: globally-installed hooks fire from every
   * agent session on the machine, and a foreign session stuck 'waiting' would
   * otherwise pin state forever. Unset (tests): no filtering.
   */
  constructor(
    private readonly hostHarness: Harness,
    private readonly hostWrapperId?: string,
  ) {
    super()
    this.tracker = new SessionTracker({
      onChange: () => this.emit('aggregate', this.tracker.aggregate()),
    })
    if (hostWrapperId) this.wrapperHarness.set(hostWrapperId, hostHarness)
  }

  /** Port actually bound (differs from HOST_PORT only in tests using port 0). */
  boundPort = 0

  /** Bind the singleton port. Resolves true = we are the host, false = port taken. */
  listen(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res).catch((err) => {
          logger.error('server request failed', err)
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
      })
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') resolve(false)
        else reject(err)
      })
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        const address = server.address()
        this.boundPort = typeof address === 'object' && address ? address.port : port
        resolve(true)
      })
    })
  }

  close(): void {
    for (const { res } of this.instances.values()) res.end()
    this.server?.close()
  }

  /** Write keystrokes to a registered client instance's pty. Returns false if unknown. */
  sendKeysToInstance(instanceId: string, bytes: string): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false
    send(instance.res, { type: 'keys', data: Buffer.from(bytes, 'utf8').toString('base64') })
    return true
  }

  private isActiveOwner(wrapperId: string): boolean {
    if (wrapperId === this.hostWrapperId) return true
    for (const instance of this.instances.values()) {
      if (instance.wrapperId === wrapperId) return true
    }
    return false
  }

  /** Find the client instance that owns the given session (null = host's own pty). */
  instanceForSession(sessionId: string): string | null {
    const owner = this.sessionOwners.get(sessionId)
    if (!owner) return null
    for (const [id, instance] of this.instances) {
      if (instance.wrapperId === owner) return id
    }
    return null
  }

  removeSessionsForOwner(wrapperId: string): boolean {
    let removed = false
    for (const [sessionId, owner] of this.sessionOwners) {
      if (owner !== wrapperId) continue
      removed = this.tracker.remove(sessionId) || removed
      this.sessionOwners.delete(sessionId)
    }
    return removed
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', HOST_URL)
    const { pathname } = url

    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ app: 'openmicro' }))
      return
    }

    if (req.method === 'POST' && pathname.startsWith(HOOK_PATH)) {
      await this.handleHook(pathname.slice(HOOK_PATH.length), req, res)
      return
    }

    if (req.method === 'POST' && pathname === '/register') {
      await this.handleRegister(req, res)
      return
    }

    if (pathname.startsWith('/instance/')) {
      this.handleInstanceStream(pathname.slice('/instance/'.length), req, res)
      return
    }

    res.writeHead(404)
    res.end()
  }

  private async handleHook(
    event: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const body = await readBody(req)
    let sessionId = 'unknown'
    let payload: unknown
    try {
      payload = JSON.parse(body)
      sessionId = (payload as { session_id?: string }).session_id ?? 'unknown'
    } catch {
      // Payload shape is the harness's internal contract — event name alone still works.
    }

    const header = req.headers[INSTANCE_HEADER]
    const wrapperId = Array.isArray(header) ? header[0] : header

    // Only sessions owned by an active wrapper (the host's own agent or a
    // registered client) drive the FSM. Header-less hooks come from agent
    // sessions openmicro never wrapped; when scoping is on they are ignored —
    // cwd cannot disambiguate sessions sharing a directory.
    let trusted: boolean
    let harness: Harness = this.hostHarness
    if (wrapperId) {
      trusted = this.isActiveOwner(wrapperId)
      harness = this.wrapperHarness.get(wrapperId) ?? this.hostHarness
      if (trusted) this.sessionOwners.set(sessionId, wrapperId)
    } else {
      trusted = !this.hostWrapperId // filtering off (bare server in tests)
    }

    if (trusted) {
      let changed = false
      if (event === 'SessionEnd') {
        // Harnesses classify SessionEnd as null (caller removes) — a dead waiter
        // must not pin the FSM.
        changed = this.tracker.remove(sessionId)
      } else {
        const state = harness.stateForHookEvent(event, payload)
        if (state !== null) {
          changed = this.tracker.apply(sessionId, state, { focusOnStop: Boolean(wrapperId) })
        }
      }
      if (changed) this.emit('aggregate', this.tracker.aggregate())
    }
    res.writeHead(200)
    res.end()
  }

  private async handleRegister(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readBody(req)
    let cwd = ''
    let wrapperId: string | null = null
    let kind: string | undefined
    try {
      const registration = JSON.parse(body) as { cwd?: string; wrapperId?: string; kind?: string }
      cwd = registration.cwd ?? ''
      wrapperId = registration.wrapperId ?? null
      kind = registration.kind
    } catch {
      // cwd stays unmatched; keystrokes just won't route to this instance.
    }
    let harness = this.hostHarness
    if (kind) {
      try {
        harness = harnessFor(kind)
      } catch {
        // Unknown kind from a client — classify with the host harness as a fallback.
      }
    }
    if (wrapperId) this.wrapperHarness.set(wrapperId, harness)
    const id = String(this.nextInstanceId++)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ instanceId: id, cwd, wrapperId }))
    logger.info('client instance registered', { id, cwd, wrapperId, kind })
    // The SSE connection on /instance/<id> completes registration.
    this.pendingInstances.set(id, { cwd, wrapperId })
  }

  private handleInstanceStream(
    id: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    sse(res)
    const pending = this.pendingInstances.get(id) ?? { cwd: '', wrapperId: null }
    this.instances.set(id, { res, ...pending })
    this.pendingInstances.delete(id)
    req.on('close', () => {
      const instance = this.instances.get(id)
      if (!instance) return
      this.instances.delete(id)
      if (instance.wrapperId && this.removeSessionsForOwner(instance.wrapperId)) {
        this.emit('aggregate', this.tracker.aggregate())
      }
    })
  }
}
