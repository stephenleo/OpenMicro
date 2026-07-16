// Integration test: real HostServer on an ephemeral port. Hook POSTs to
// /om-hook/<event> drive the aggregate (classified through the reporting
// session's harness), and SSE streams forward keystrokes to client instances.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { harnessFor } from '../src/harness/index.js'
import { HostServer } from '../src/server.js'
import type { Aggregate } from '../src/state.js'

const claude = harnessFor('claude')

let server: HostServer
let base: string

beforeEach(async () => {
  server = new HostServer(claude)
  await server.listen(0) // ephemeral port so tests never collide with a running host
  base = `http://127.0.0.1:${server.boundPort}`
})

afterEach(() => server.close())

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
    expect(aggregates.at(-1)).toEqual({ playing: true, focusSessionId: null })

    await postHook('PreToolUse', 's1') // AskUserQuestion → waiting
    expect(aggregates.at(-1)).toEqual({ playing: false, focusSessionId: 's1' })
  })

  it('removes a session on SessionEnd so a dead waiter cannot pin state', async () => {
    const aggregates: Aggregate[] = []
    server.on('aggregate', (a: Aggregate) => aggregates.push(a))
    await postHook('PreToolUse', 's1') // waiting → pauses on s1
    expect(aggregates.at(-1)).toEqual({ playing: false, focusSessionId: 's1' })
    await postHook('SessionEnd', 's1')
    expect(aggregates.at(-1)).toEqual({ playing: false, focusSessionId: null })
  })

  it('forwards keystrokes to a registered instance by session cwd', async () => {
    const reg = await fetch(`${base}/register`, {
      method: 'POST',
      body: JSON.stringify({ cwd: '/tmp/project-a' }),
    })
    const { instanceId } = (await reg.json()) as { instanceId: string }

    const stream = await fetch(`${base}/instance/${instanceId}`)
    await postHook('Notification', 'sess-a', { cwd: '/tmp/project-a' })

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
    const scoped = new HostServer(claude, '/tmp/host', 'host-wrapper')
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
      expect(aggregates.at(-1)).toEqual({ playing: false, focusSessionId: 'codex-sess' })
    } finally {
      scoped.close()
    }
  })

  it('accepts owned host hooks and ignores unknown wrapper IDs', async () => {
    const owned = new HostServer(claude, '/tmp/shared', 'host-wrapper')
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
      expect(aggregates.at(-1)).toEqual({ playing: false, focusSessionId: 'host-wrapper' })
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
    expect(server.sessionCwds.has('session-a')).toBe(false)
    expect(server.sessionOwners.get('session-b')).toBe('wrapper-b')
    controllerB.abort()
  })

  it('ignores hook events from sessions outside the wrapped cwds', async () => {
    // Global hooks fire from every agent session on the machine; a foreign
    // session (e.g. a headless observer) going 'waiting' must not pin state.
    const scoped = new HostServer(claude, '/tmp/host-project')
    await scoped.listen(0)
    const scopedBase = `http://127.0.0.1:${scoped.boundPort}`
    const aggregates: Aggregate[] = []
    scoped.on('aggregate', (a: Aggregate) => aggregates.push(a))
    const post = (event: string, body: Record<string, unknown>) =>
      fetch(`${scopedBase}/om-hook/${event}`, { method: 'POST', body: JSON.stringify(body) })

    try {
      await post('UserPromptSubmit', { session_id: 'ours', cwd: '/tmp/host-project' })
      expect(aggregates.at(-1)).toEqual({ playing: true, focusSessionId: null })

      // Foreign observer goes 'waiting' — without scoping this pauses forever.
      await post('Notification', { session_id: 'observer', cwd: '/tmp/unrelated' })
      expect(aggregates.at(-1)).toEqual({ playing: true, focusSessionId: null })

      // Missing cwd is also untrusted once scoping is on.
      await post('Notification', { session_id: 'no-cwd' })
      expect(aggregates.at(-1)).toEqual({ playing: true, focusSessionId: null })

      // A registered client instance's cwd is trusted like the host's own.
      await fetch(`${scopedBase}/register`, {
        method: 'POST',
        body: JSON.stringify({ cwd: '/tmp/client-project', kind: 'claude' }),
      })
      await post('PreToolUse', { session_id: 'client-sess', cwd: '/tmp/client-project' })
      expect(aggregates.at(-1)).toEqual({ playing: false, focusSessionId: 'client-sess' })
    } finally {
      scoped.close()
    }
  })
})
