// Unit tests for the herdr bridge: openmicro state → herdr CLI arg mapping,
// and total error swallowing (herdr absent must never break the host).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile }))

import type { AgentState } from '../src/harness/types.js'
import { releaseAgent, reportAgentState } from '../src/herdr.js'

beforeEach(() => {
  execFile.mockReset()
})

describe('reportAgentState', () => {
  it.each<[AgentState, string]>([
    ['executing', 'working'],
    ['waiting', 'blocked'],
    ['error', 'blocked'],
    ['idle', 'idle'],
    ['complete', 'idle'],
  ])('maps %s → herdr state %s', (state, herdrState) => {
    reportAgentState('pane-1', state)
    expect(execFile).toHaveBeenCalledWith(
      'herdr',
      [
        'pane',
        'report-agent',
        'pane-1',
        '--source',
        'openmicro',
        '--agent',
        'openmicro',
        '--state',
        herdrState,
      ],
      expect.any(Function),
    )
  })

  it('forwards the session id as --agent-session-id when given', () => {
    reportAgentState('pane-2', 'executing', 'sess-9')
    const args = execFile.mock.calls[0]![1] as string[]
    expect(args.slice(-2)).toEqual(['--agent-session-id', 'sess-9'])
  })

  it('swallows synchronous spawn failures and callback errors', () => {
    execFile.mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    expect(() => reportAgentState('pane-1', 'executing')).not.toThrow()

    execFile.mockImplementationOnce((_cmd, _args, cb: (err: Error) => void) =>
      cb(new Error('exit 1')),
    )
    expect(() => reportAgentState('pane-1', 'waiting')).not.toThrow()
  })
})

describe('releaseAgent', () => {
  it('releases the pane claim with matching source and agent', () => {
    releaseAgent('pane-3')
    expect(execFile).toHaveBeenCalledWith(
      'herdr',
      ['pane', 'release-agent', 'pane-3', '--source', 'openmicro', '--agent', 'openmicro'],
      expect.any(Function),
    )
  })

  it('swallows spawn failures', () => {
    execFile.mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    expect(() => releaseAgent('pane-3')).not.toThrow()
  })
})
