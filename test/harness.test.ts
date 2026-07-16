import { describe, expect, it } from 'vitest'
import { claudeHarness } from '../src/harness/claude.js'
import { codexHarness } from '../src/harness/codex.js'
import { harnessFor, registerHarness } from '../src/harness/index.js'
import type { Harness } from '../src/harness/types.js'

describe('registry', () => {
  it('resolves the built-in harnesses', () => {
    expect(harnessFor('claude').kind).toBe('claude')
    expect(harnessFor('codex').kind).toBe('codex')
  })

  it('throws a clear error listing known kinds on unknown lookup', () => {
    expect(() => harnessFor('gpt5')).toThrowError(/unknown harness 'gpt5'.*claude.*codex/s)
  })

  it('registers a third-party harness under its own kind', () => {
    const gemini = { ...codexHarness, kind: 'gemini' } as unknown as Harness
    registerHarness(gemini)
    expect(harnessFor('gemini')).toBe(gemini)
  })
})

describe('claude harness', () => {
  const ctx = { thinkingLevel: 2 }

  it('maps hook events to states', () => {
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
