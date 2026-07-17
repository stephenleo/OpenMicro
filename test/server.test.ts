// Integration test: real HostServer on an ephemeral port. Hook POSTs to
// /om-hook/<event> drive the aggregate (classified through the reporting
// session's harness), and SSE streams forward keystrokes to client instances.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { harnessFor } from '../src/harness/index.js'
import { releaseAgent, reportAgentState } from '../src/herdr.js'
import { HostServer } from '../src/server.js'
import type { Aggregate } from '../src/state.js'

vi.mock('../src/herdr.js', () => ({ reportAgentState: vi.fn(), releaseAgent: vi.fn() }))

const claude = harnessFor('claude')

let server: HostServer
let base: string

beforeEach(async () => {
  server = new HostServer(claude)
  await server.listen(0) // ephemeral port so tests never collide with a running host
  base = `http://127.0.0.1:${server.boundPort}`
})

afterEach(() => {
  server.close()
  vi.clearAllMocks()
})

async function postHook(event: string, sessionId: string, extra: Record<string, unknown> = {}) {
  await fetch(`${base}/om-hook/${event}`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, ...extra }),
  })
}

async function postOwnedHook(
  event: string,
  sessionId: string,
  wrapperId: string,
  extra: Record<string, unknown> = {},
) {
  await fetch(`${base}/om-hook/${event}`, {
    method: 'POST',
    headers: { 'X-Openmicro-Instance-Id': wrapperId },
    body: JSON.stringify({ session_id: sessionId, ...extra }),
  })
}

/** Read one SSE data frame from a streaming response. */
async function nextFrame(body: ReadableStream<Uint8Array>): Promise<Record<string, unknown>> {
  const reader = body.getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) throw new Error('stream ended')
    buffer += new TextDecoder().decode(value)
    const match = buffer.match(/data: (.*)\n\n/)
    if (match) {
      reader.releaseLock()
      return JSON.parse(match[1]!)
    }
  }
}

describe('HostServer', () => {
  it('identifies itself on /health', async () => {
    const res = await fetch(`${base}/health`)
    expect(await res.json()).toEqual({ app: 'openmicro' })
  })

  it('classifies hook POSTs through the harness to drive the aggregate', async () => {
    const aggregates: Aggregate[] = []
    server.on('aggregate', (a: Aggregate) => aggregates.push(a))

    await postHook('UserPromptSubmit', 's1') // → executing
    expect(aggregates.at(-1)).toEqual({
      playing: true,
      focusSessionId: null,
      focusIsAttention: false,
    })

    await postHook('PreToolUse', 's1') // AskUserQuestion → waiting
    expect(aggregates.at(-1)).toEqual({
      playing: false,
      focusSessionId: 's1',
      focusIsAttention: true,
    })
  })

  it('removes a session on SessionEnd so a dead waiter cannot pin state', async () => {
    const aggregates: Aggregate[] = []
    server.on('aggregate', (a: Aggregate) => aggregates.push(a))
    await postHook('PreToolUse', 's1') // waiting → pauses on s1
    expect(aggregates.at(-1)).toEqual({
      playing: false,
      focusSessionId: 's1',
      focusIsAttention: true,
    })
    await postHook('SessionEnd', 's1')
    expect(aggregates.at(-1)).toEqual({
      playing: false,
      focusSessionId: null,
      focusIsAttention: false,
    })
  })

  it('forwards keystrokes to the instance that owns the session', async () => {
    const reg = await fetch(`${base}/register`, {
      method: 'POST',
      body: JSON.stringify({ cwd: '/tmp/project-a', wrapperId: 'wrap-a', kind: 'claude' }),
    })
    const { instanceId } = (await reg.json()) as { instanceId: string }

    const stream = await fetch(`${base}/instance/${instanceId}`)
    await postOwnedHook('Notification', 'sess-a', 'wrap-a', { cwd: '/tmp/project-a' })

    expect(server.instanceForSession('sess-a')).toBe(instanceId)
    expect(server.sendKeysToInstance(instanceId, '\r')).toBe(true)
    expect(await nextFrame(stream.body!)).toEqual({
      type: 'keys',
      data: Buffer.from('\r').toString('base64'),
    })
  })

  it('sendKeysToInstance returns false for unknown instances', () => {
    expect(server.sendKeysToInstance('nope', 'x')).toBe(false)
  })

  it('classifies each session with its own registered harness kind', async () => {
    // Claude has no PermissionRequest event (→ null), Codex maps it to waiting.
    // Registering the instance as codex must make PermissionRequest pause.
    const scoped = new HostServer(claude, 'host-wrapper')
    await scoped.listen(0)
    const scopedBase = `http://127.0.0.1:${scoped.boundPort}`
    const aggregates: Aggregate[] = []
    scoped.on('aggregate', (a: Aggregate) => aggregates.push(a))
    try {
      const reg = await fetch(`${scopedBase}/register`, {
        method: 'POST',
        body: JSON.stringify({ cwd: '/tmp/codex-proj', wrapperId: 'codex-wrap', kind: 'codex' }),
      })
      const { instanceId } = (await reg.json()) as { instanceId: string }
      await fetch(`${scopedBase}/instance/${instanceId}`)

      await fetch(`${scopedBase}/om-hook/PermissionRequest`, {
        method: 'POST',
        headers: { 'X-Openmicro-Instance-Id': 'codex-wrap' },
        body: JSON.stringify({ session_id: 'codex-sess', cwd: '/tmp/codex-proj' }),
      })
      expect(aggregates.at(-1)).toEqual({
        playing: false,
        focusSessionId: 'codex-sess',
        focusIsAttention: true,
      })
    } finally {
      scoped.close()
    }
  })

  it('accepts owned host hooks and ignores unknown wrapper IDs', async () => {
    const owned = new HostServer(claude, 'host-wrapper')
    await owned.listen(0)
    const ownedBase = `http://127.0.0.1:${owned.boundPort}`
    const aggregates: Aggregate[] = []
    owned.on('aggregate', (a: Aggregate) => aggregates.push(a))
    const post = (wrapperId: string) =>
      fetch(`${ownedBase}/om-hook/UserPromptSubmit`, {
        method: 'POST',
        headers: { 'X-Openmicro-Instance-Id': wrapperId },
        body: JSON.stringify({ session_id: wrapperId, cwd: '/tmp/shared' }),
      })
    try {
      await post('host-wrapper')
      expect(aggregates).toHaveLength(1)
      await fetch(`${ownedBase}/om-hook/Stop`, {
        method: 'POST',
        headers: { 'X-Openmicro-Instance-Id': 'host-wrapper' },
        body: JSON.stringify({ session_id: 'host-wrapper', cwd: '/tmp/shared' }),
      })
      // Stop → complete (transient); focusOnStop lets it hold focus, paused.
      expect(aggregates.at(-1)).toEqual({
        playing: false,
        focusSessionId: 'host-wrapper',
        focusIsAttention: false,
      })
      await post('unknown-wrapper')
      expect(aggregates).toHaveLength(2)
      expect(owned.sessionOwners.get('host-wrapper')).toBe('host-wrapper')
      expect(owned.sessionOwners.has('unknown-wrapper')).toBe(false)
    } finally {
      owned.close()
    }
  })

  it('routes same-cwd clients by wrapper ownership', async () => {
    const register = async (wrapperId: string) => {
      const reg = await fetch(`${base}/register`, {
        method: 'POST',
        body: JSON.stringify({ cwd: '/tmp/shared', wrapperId, kind: 'claude' }),
      })
      const { instanceId } = (await reg.json()) as { instanceId: string }
      const stream = await fetch(`${base}/instance/${instanceId}`)
      return { instanceId, stream }
    }
    const a = await register('wrapper-a')
    const b = await register('wrapper-b')
    await postOwnedHook('PreToolUse', 'session-a', 'wrapper-a', { cwd: '/tmp/shared' })
    await postOwnedHook('PreToolUse', 'session-b', 'wrapper-b', { cwd: '/tmp/shared' })

    expect(server.instanceForSession('session-a')).toBe(a.instanceId)
    expect(server.instanceForSession('session-b')).toBe(b.instanceId)
    await a.stream.body?.cancel()
    await b.stream.body?.cancel()
  })

  it('removes only a disconnected client wrapper sessions', async () => {
    const register = async (wrapperId: string) => {
      const reg = await fetch(`${base}/register`, {
        method: 'POST',
        body: JSON.stringify({ cwd: '/tmp/shared', wrapperId, kind: 'claude' }),
      })
      const { instanceId } = (await reg.json()) as { instanceId: string }
      const controller = new AbortController()
      await fetch(`${base}/instance/${instanceId}`, { signal: controller.signal })
      return controller
    }
    const controllerA = await register('wrapper-a')
    const controllerB = await register('wrapper-b')
    await postOwnedHook('PreToolUse', 'session-b', 'wrapper-b', { cwd: '/tmp/shared' })
    await postOwnedHook('PreToolUse', 'session-a', 'wrapper-a', { cwd: '/tmp/shared' })
    expect(server.tracker.aggregate().focusSessionId).toBe('session-a')

    controllerA.abort()
    await expect.poll(() => server.tracker.aggregate().focusSessionId).toBe('session-b')
    expect(server.sessionOwners.has('session-a')).toBe(false)
    expect(server.sessionOwners.get('session-b')).toBe('wrapper-b')
    controllerB.abort()
  })

  it('mirrors trusted hook state to herdr when the pane header is present', async () => {
    await fetch(`${base}/om-hook/UserPromptSubmit`, {
      method: 'POST',
      headers: { 'X-Herdr-Pane-Id': 'pane-7' },
      body: JSON.stringify({ session_id: 's1' }),
    })
    expect(reportAgentState).toHaveBeenCalledWith('pane-7', 'executing', 's1')

    await fetch(`${base}/om-hook/SessionEnd`, {
      method: 'POST',
      headers: { 'X-Herdr-Pane-Id': 'pane-7' },
      body: JSON.stringify({ session_id: 's1' }),
    })
    expect(releaseAgent).toHaveBeenCalledWith('pane-7')
  })

  it('never reports to herdr without the pane header or from untrusted hooks', async () => {
    await postHook('UserPromptSubmit', 's1') // trusted but no pane header
    expect(reportAgentState).not.toHaveBeenCalled()

    // Untrusted (unknown wrapper on a scoped server) must not leak to herdr.
    const scoped = new HostServer(claude, 'host-wrapper')
    await scoped.listen(0)
    try {
      await fetch(`http://127.0.0.1:${scoped.boundPort}/om-hook/UserPromptSubmit`, {
        method: 'POST',
        headers: { 'X-Openmicro-Instance-Id': 'unknown-wrapper', 'X-Herdr-Pane-Id': 'pane-9' },
        body: JSON.stringify({ session_id: 'foreign' }),
      })
      expect(reportAgentState).not.toHaveBeenCalled()
    } finally {
      scoped.close()
    }
  })

  it('ignores header-less hook events from sessions openmicro never wrapped', async () => {
    // Global hooks fire from every agent session on the machine. An unwrapped
    // session has no OPENMICRO_INSTANCE_ID, so its hooks carry no ownership
    // header — it must not enter the tracker (it would pollute focus cycling
    // and pin state), even when its cwd matches a wrapped session's.
    const scoped = new HostServer(claude, 'host-wrapper')
    await scoped.listen(0)
    const scopedBase = `http://127.0.0.1:${scoped.boundPort}`
    const aggregates: Aggregate[] = []
    scoped.on('aggregate', (a: Aggregate) => aggregates.push(a))
    const post = (event: string, body: Record<string, unknown>, wrapperId?: string) =>
      fetch(`${scopedBase}/om-hook/${event}`, {
        method: 'POST',
        ...(wrapperId ? { headers: { 'X-Openmicro-Instance-Id': wrapperId } } : {}),
        body: JSON.stringify(body),
      })

    try {
      await post('UserPromptSubmit', { session_id: 'ours', cwd: '/tmp/host' }, 'host-wrapper')
      expect(aggregates.at(-1)).toEqual({
        playing: true,
        focusSessionId: null,
        focusIsAttention: false,
      })

      // Unwrapped observer in the same cwd goes 'waiting' — must not pin state.
      await post('Notification', { session_id: 'observer', cwd: '/tmp/host' })
      expect(aggregates.at(-1)).toEqual({
        playing: true,
        focusSessionId: null,
        focusIsAttention: false,
      })
      expect(scoped.sessionOwners.has('observer')).toBe(false)
    } finally {
      scoped.close()
    }
  })
})
