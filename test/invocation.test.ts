// parseInvocation splits argv into a harness kind + forwarded args. The kind is
// resolved (and validated) later by harnessFor, so parsing stays purely lexical.

import { describe, expect, it } from 'vitest'
import { parseInvocation } from '../src/invocation.js'

describe('parseInvocation', () => {
  it('defaults to claude with no args', () => {
    expect(parseInvocation([])).toEqual({ kind: 'claude', agentArgs: [], help: false })
  })

  it('treats a leading flag as claude args, not a harness kind', () => {
    expect(parseInvocation(['--resume', 'x'])).toEqual({
      kind: 'claude',
      agentArgs: ['--resume', 'x'],
      help: false,
    })
  })

  it('takes a leading bare word as the harness kind', () => {
    expect(parseInvocation(['codex', '--foo'])).toEqual({
      kind: 'codex',
      agentArgs: ['--foo'],
      help: false,
    })
  })

  it('passes an unknown bare word through as the kind (cli validates it)', () => {
    expect(parseInvocation(['gemini'])).toEqual({ kind: 'gemini', agentArgs: [], help: false })
  })

  it('flags --help', () => {
    expect(parseInvocation(['--help']).help).toBe(true)
    expect(parseInvocation(['-h']).help).toBe(true)
  })
})
