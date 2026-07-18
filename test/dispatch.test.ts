// dispatchAction maps a routed Action to injected effect closures. Covers the
// core-only actions (focus/layer), workflow preset resolution, harness byte
// output + thinking-level tracking, and the documented-gap null case.

import { describe, expect, it } from 'vitest'
import { dispatchAction } from '../src/dispatch.js'
import type { DispatchDeps } from '../src/dispatch.js'
import { claudeHarness } from '../src/harness/claude.js'
import { codexAppHarness } from '../src/harness/codex-app.js'
import { codexHarness } from '../src/harness/codex.js'
import type { Action } from '../src/harness/types.js'
import { DEFAULT_CONFIG } from '../src/layers.js'

function makeDeps(overrides: Partial<DispatchDeps> = {}): {
  deps: DispatchDeps
  writes: string[]
  focus: number[]
  layers: number[]
  levels: number[]
  herdrCycles: number[]
} {
  const writes: string[] = []
  const focus: number[] = []
  const layers: number[] = []
  const levels: number[] = []
  const herdrCycles: number[] = []
  let thinking = 2
  const deps: DispatchDeps = {
    harness: claudeHarness,
    config: DEFAULT_CONFIG,
    getThinkingLevel: () => thinking,
    setThinkingLevel: (l) => {
      thinking = l
      levels.push(l)
    },
    write: (b) => writes.push(b),
    focusSession: (i) => focus.push(i),
    setLayer: (i) => layers.push(i),
    cycleHerdrSpace: () => herdrCycles.push(1),
    ...overrides,
  }
  return { deps, writes, focus, layers, levels, herdrCycles }
}

describe('dispatchAction', () => {
  it('sends harness bytes for a simple action', () => {
    const { deps, writes } = makeDeps()
    dispatchAction({ type: 'accept' }, deps)
    expect(writes).toEqual(['\r'])
  })

  it('resolves a workflow preset to prompt text then bytes', () => {
    const { deps, writes } = makeDeps()
    dispatchAction({ type: 'workflow', presetId: 'review-pr' }, deps)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toBe(DEFAULT_CONFIG.workflows['review-pr'] + '\r')
  })

  it('ignores an unknown workflow preset', () => {
    const { deps, writes } = makeDeps()
    dispatchAction({ type: 'workflow', presetId: 'nope' }, deps)
    expect(writes).toEqual([])
  })

  it('tracks the new thinking level from a depth change', () => {
    const { deps, writes, levels } = makeDeps()
    dispatchAction({ type: 'thinking_depth', delta: 1 }, deps) // 2 → 3 (xhigh)
    expect(levels).toEqual([3])
    expect(writes).toEqual(['/effort xhigh\r'])
  })

  it('routes focus_session and layer to their core handlers', () => {
    const { deps, focus, layers, writes } = makeDeps()
    dispatchAction({ type: 'focus_session', index: -1 }, deps)
    dispatchAction({ type: 'layer', index: 3 }, deps)
    expect(focus).toEqual([-1])
    expect(layers).toEqual([3])
    expect(writes).toEqual([]) // neither reaches the harness
  })

  it('routes herdr_space to its core handler', () => {
    const { deps, herdrCycles, writes } = makeDeps()
    dispatchAction({ type: 'herdr_space' }, deps)
    expect(herdrCycles).toEqual([1])
    expect(writes).toEqual([]) // never reaches the harness
  })

  it('routes focus_session and herdr_space to the harness for GUI harnesses', () => {
    const { deps, focus, herdrCycles, writes } = makeDeps({ harness: codexAppHarness })
    dispatchAction({ type: 'focus_session', index: -1 }, deps)
    dispatchAction({ type: 'herdr_space' }, deps)
    expect(focus).toEqual([]) // core pane cycling is bypassed in GUI mode
    expect(herdrCycles).toEqual([])
    expect(writes).toEqual([
      'osascript:key code 30 using {command down, shift down}',
      'osascript:key code 50 using command down',
    ])
  })

  it('silently skips a documented harness gap (Codex push-to-talk)', () => {
    const { deps, writes } = makeDeps({ harness: codexHarness })
    dispatchAction({ type: 'push_to_talk' } as Action, deps)
    expect(writes).toEqual([])
  })
})
