import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile }))

import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { claudeHarness } from '../src/harness/claude.js'
import { codexHarness } from '../src/harness/codex.js'
import {
  codexAppHarness,
  cycleProject,
  cycleThread,
  scanDesktopThreads,
} from '../src/harness/codex-app.js'
import { harnessFor, registerHarness } from '../src/harness/index.js'
import type { Harness } from '../src/harness/types.js'

describe('registry', () => {
  it('resolves the built-in harnesses', () => {
    expect(harnessFor('claude').kind).toBe('claude')
    expect(harnessFor('codex').kind).toBe('codex')
    expect(harnessFor('codex-app').kind).toBe('codex-app')
  })

  it('throws a clear error listing known kinds on unknown lookup', () => {
    expect(() => harnessFor('gpt5')).toThrowError(/unknown harness 'gpt5'.*claude.*codex/s)
  })

  it('registers a third-party harness under its own kind', () => {
    const gemini: Harness = { ...codexHarness, kind: 'gemini' }
    registerHarness(gemini)
    expect(harnessFor('gemini')).toBe(gemini)
  })
})

describe('claude harness', () => {
  const ctx = { thinkingLevel: 2 }

  it('maps hook events to states', () => {
    expect(claudeHarness.stateForHookEvent('SessionStart', {})).toBe('idle')
    expect(claudeHarness.stateForHookEvent('UserPromptSubmit', {})).toBe('executing')
    expect(claudeHarness.stateForHookEvent('PostToolUse', {})).toBe('executing')
    expect(claudeHarness.stateForHookEvent('Stop', {})).toBe('complete')
    expect(claudeHarness.stateForHookEvent('PreToolUse', {})).toBe('waiting')
    expect(claudeHarness.stateForHookEvent('Notification', { message: 'ready' })).toBe('waiting')
    expect(claudeHarness.stateForHookEvent('SessionEnd', {})).toBeNull()
    expect(claudeHarness.stateForHookEvent('WeirdFutureEvent', {})).toBeNull()
  })

  it('sniffs an error notification best-effort', () => {
    expect(claudeHarness.stateForHookEvent('Notification', { message: 'Build failed' })).toBe(
      'error',
    )
    expect(claudeHarness.stateForHookEvent('Notification', 'not an object')).toBe('waiting')
  })

  it('resolves the verified keybindings', () => {
    expect(claudeHarness.resolveAction({ type: 'accept' }, ctx)).toEqual({ bytes: '\r' })
    expect(claudeHarness.resolveAction({ type: 'reject' }, ctx)).toEqual({ bytes: '\x1b' })
    expect(claudeHarness.resolveAction({ type: 'push_to_talk' }, ctx)).toEqual({ bytes: ' ' })
    expect(claudeHarness.resolveAction({ type: 'new_chat' }, ctx)).toEqual({ bytes: '/clear\r' })
    expect(claudeHarness.resolveAction({ type: 'prompt', text: 'hi' }, ctx)).toEqual({
      bytes: 'hi\r',
    })
    expect(claudeHarness.resolveAction({ type: 'keys', bytes: '\x1b[A' }, ctx)).toEqual({
      bytes: '\x1b[A',
    })
  })

  it('steps thinking depth through the effort levels and clamps', () => {
    // level 2 (high) + 1 → 3 (xhigh)
    expect(
      claudeHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, { thinkingLevel: 2 }),
    ).toEqual({
      bytes: '/effort xhigh\r',
      thinkingLevel: 3,
    })
    // clamp at top (max = index 4)
    expect(
      claudeHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, { thinkingLevel: 4 }),
    ).toEqual({
      bytes: '/effort max\r',
      thinkingLevel: 4,
    })
    // clamp at bottom (low = index 0)
    expect(
      claudeHarness.resolveAction({ type: 'thinking_depth', delta: -1 }, { thinkingLevel: 0 }),
    ).toEqual({
      bytes: '/effort low\r',
      thinkingLevel: 0,
    })
  })

  it('returns null for actions that never reach a harness', () => {
    expect(claudeHarness.resolveAction({ type: 'workflow', presetId: 'x' }, ctx)).toBeNull()
    expect(claudeHarness.resolveAction({ type: 'focus_session', index: 0 }, ctx)).toBeNull()
    expect(claudeHarness.resolveAction({ type: 'layer', index: 1 }, ctx)).toBeNull()
  })
})

describe('codex harness', () => {
  const ctx = { thinkingLevel: 1 }

  it('maps hook events to states', () => {
    expect(codexHarness.stateForHookEvent('UserPromptSubmit', {})).toBe('executing')
    expect(codexHarness.stateForHookEvent('PostToolUse', {})).toBe('executing')
    expect(codexHarness.stateForHookEvent('PermissionRequest', {})).toBe('waiting')
    expect(codexHarness.stateForHookEvent('Stop', {})).toBe('complete')
    expect(codexHarness.stateForHookEvent('SessionEnd', {})).toBeNull()
    expect(codexHarness.stateForHookEvent('Notification', {})).toBeNull()
  })

  it('resolves verified keybindings and returns null for documented gaps', () => {
    expect(codexHarness.resolveAction({ type: 'accept' }, ctx)).toEqual({ bytes: '\r' })
    expect(codexHarness.resolveAction({ type: 'reject' }, ctx)).toEqual({ bytes: '\x1b' })
    expect(codexHarness.resolveAction({ type: 'new_chat' }, ctx)).toEqual({ bytes: '/new\r' })
    expect(codexHarness.resolveAction({ type: 'prompt', text: 'hi' }, ctx)).toEqual({
      bytes: 'hi\r',
    })
    expect(codexHarness.resolveAction({ type: 'keys', bytes: '\x1b[B' }, ctx)).toEqual({
      bytes: '\x1b[B',
    })
    // documented gaps — no voice, no deterministic effort keystroke
    expect(codexHarness.resolveAction({ type: 'push_to_talk' }, ctx)).toBeNull()
    expect(codexHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, ctx)).toBeNull()
  })
})

describe('codex-app harness', () => {
  const ctx = { thinkingLevel: 1 }

  beforeEach(() => {
    execFile.mockReset()
  })

  it('is a GUI harness (no pty)', () => {
    expect(codexAppHarness.usesPty).toBe(false)
  })

  it('resolves actions to tagged open/osascript bytes', () => {
    expect(codexAppHarness.resolveAction({ type: 'accept' }, ctx)).toEqual({
      bytes: 'osascript:keystroke return',
    })
    // push_to_talk emulates the app's hold-to-dictate chord: first call holds
    // the keys down, second call releases them.
    expect(codexAppHarness.resolveAction({ type: 'push_to_talk' }, ctx)).toEqual({
      bytes: 'osascript:key down control\nkey down shift\nkey down "d"',
    })
    expect(codexAppHarness.resolveAction({ type: 'push_to_talk' }, ctx)).toEqual({
      bytes: 'osascript:key up "d"\nkey up shift\nkey up control',
    })
    expect(codexAppHarness.resolveAction({ type: 'new_chat' }, ctx)).toEqual({
      bytes: 'open:codex://new',
    })
  })

  it('URL-encodes prompt text into the deep link', () => {
    expect(codexAppHarness.resolveAction({ type: 'prompt', text: 'fix a & b?' }, ctx)).toEqual({
      bytes: 'open:codex://new?prompt=fix%20a%20%26%20b%3F',
    })
  })

  it('maps reject to Escape and known key bytes to System Events equivalents', () => {
    expect(codexAppHarness.resolveAction({ type: 'reject' }, ctx)).toEqual({
      bytes: 'osascript:key code 53',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[A' }, ctx)).toEqual({
      bytes: 'osascript:key code 126',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x15' }, ctx)).toEqual({
      bytes: 'osascript:keystroke "a" using command down\nkey code 51',
    })
  })

  it('returns null for documented gaps and core-only actions', () => {
    expect(codexAppHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, ctx)).toBeNull()
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x07' }, ctx)).toBeNull()
    expect(codexAppHarness.resolveAction({ type: 'workflow', presetId: 'x' }, ctx)).toBeNull()
    expect(codexAppHarness.resolveAction({ type: 'layer', index: 1 }, ctx)).toBeNull()
  })

  it('scans visible threads from the catalog db in stable id order', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-state-'))
    const dbPath = path.join(dir, 'state.sqlite')
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
      DatabaseSync: new (path: string) => {
        exec(sql: string): void
        close(): void
      }
    }
    const db = new DatabaseSync(dbPath)
    db.exec(`CREATE TABLE threads (
      id TEXT PRIMARY KEY, cwd TEXT, source TEXT, archived INTEGER,
      updated_at INTEGER, recency_at_ms INTEGER
    );
    INSERT INTO threads VALUES
      ('a', '/p1', 'cli', 0, 1, 1000),
      ('b', '/p2', 'vscode', 0, 2, 2000),
      ('c', '/p1', 'cli', 1, 3, 3000),
      ('d', '/p1', '{"subagent":"review"}', 0, 4, 4000),
      ('e', '/p1', 'cli', 0, 5, NULL);`)
    db.close()
    const threads = scanDesktopThreads(dbPath)
    expect(threads.map((t) => t.id)).toEqual(['e', 'b', 'a']) // archived + subagent excluded
    expect(threads.find((t) => t.id === 'e')?.mtime).toBe(5000) // recency falls back to updated_at
    expect(scanDesktopThreads(path.join(dir, 'missing.sqlite'))).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('cycles threads within a project with wrap-around', () => {
    const threads = [
      { id: 't3', cwd: '/p1', mtime: 3 },
      { id: 'other', cwd: '/p2', mtime: 2 },
      { id: 't1', cwd: '/p1', mtime: 1 },
    ]
    const cur = { threadId: null, cwd: null }
    expect(cycleThread(threads, cur)?.id).toBe('t3') // nothing selected yet — start at newest
    expect(cycleThread(threads, cur)?.id).toBe('t1')
    expect(cycleThread(threads, cur)?.id).toBe('t3') // wraps, never leaves /p1
  })

  it('cycles projects by recency with wrap-around, landing on the newest thread', () => {
    const threads = [
      { id: 'a2', cwd: '/pa', mtime: 4 },
      { id: 'b1', cwd: '/pb', mtime: 3 },
      { id: 'a1', cwd: '/pa', mtime: 2 },
    ]
    const cur = { threadId: null, cwd: null }
    expect(cycleProject(threads, cur)?.id).toBe('b1') // cold start: switch away from most-active /pa
    expect(cycleProject(threads, cur)?.id).toBe('a2') // wraps back to /pa's newest
    expect(cur).toEqual({ threadId: 'a2', cwd: '/pa' })
  })

  it('returns to the most active project when the cursor sits on an unknown cwd', () => {
    const threads = [
      { id: 'a1', cwd: '/pa', mtime: 3 },
      { id: 'b1', cwd: '/pb', mtime: 2 },
    ]
    const cur = { threadId: 'x', cwd: '/gone' }
    expect(cycleProject(threads, cur)?.cwd).toBe('/pa')
  })

  it('delegates hook-event mapping to the codex harness', () => {
    for (const event of ['UserPromptSubmit', 'PermissionRequest', 'PostToolUse', 'Stop']) {
      expect(codexAppHarness.stateForHookEvent(event, {})).toBe(
        codexHarness.stateForHookEvent(event, {}),
      )
    }
    expect(codexAppHarness.stateForHookEvent('WeirdFutureEvent', {})).toBeNull()
  })

  it('executes open: bytes via execFile with an arg array', () => {
    codexAppHarness.execute?.('open:codex://new')
    expect(execFile).toHaveBeenCalledWith('open', ['codex://new'], expect.any(Function))
  })

  it('executes osascript: bytes as activate + System Events keystroke', () => {
    codexAppHarness.execute?.('osascript:keystroke return')
    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        'tell application "Codex" to activate',
        '-e',
        'delay 0.15',
        '-e',
        'tell application "System Events" to keystroke return',
      ],
      expect.any(Function),
    )
  })

  it('ignores untagged bytes', () => {
    codexAppHarness.execute?.('\x03')
    expect(execFile).not.toHaveBeenCalled()
  })
})
