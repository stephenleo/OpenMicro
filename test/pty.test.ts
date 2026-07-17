import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fixSpawnHelperPermissions, resolveCommand, spawnAgentProcess } from '../src/pty.js'

const EXEC_BITS = 0o111

let tmp: string

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

function makePrebuilds(entries: Record<string, string[]>): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openmicro-pty-'))
  for (const [dir, files] of Object.entries(entries)) {
    fs.mkdirSync(path.join(tmp, dir), { recursive: true })
    for (const file of files) {
      fs.writeFileSync(path.join(tmp, dir, file), '')
      fs.chmodSync(path.join(tmp, dir, file), 0o644)
    }
  }
  return tmp
}

describe('fixSpawnHelperPermissions', () => {
  it('makes spawn-helper executable in every prebuild dir', () => {
    const dir = makePrebuilds({
      'darwin-arm64': ['spawn-helper'],
      'darwin-x64': ['spawn-helper'],
    })
    fixSpawnHelperPermissions(dir)
    for (const arch of ['darwin-arm64', 'darwin-x64']) {
      const mode = fs.statSync(path.join(dir, arch, 'spawn-helper')).mode
      expect(mode & EXEC_BITS).not.toBe(0)
    }
  })

  it('skips prebuild dirs without a spawn-helper and still fixes the rest', () => {
    const dir = makePrebuilds({
      'linux-x64': ['pty.node'],
      'darwin-arm64': ['spawn-helper'],
    })
    fixSpawnHelperPermissions(dir)
    const mode = fs.statSync(path.join(dir, 'darwin-arm64', 'spawn-helper')).mode
    expect(mode & EXEC_BITS).not.toBe(0)
  })

  it('is a no-op when the prebuilds dir is missing', () => {
    expect(() => fixSpawnHelperPermissions('/nonexistent/prebuilds')).not.toThrow()
  })
})

describe('resolveCommand', () => {
  // Model Windows' case-insensitive filesystem so PATHEXT casing is irrelevant.
  function fakeFs(...files: string[]): (candidate: string) => boolean {
    const present = new Set(files.map((f) => f.toLowerCase()))
    return (candidate) => present.has(candidate.toLowerCase())
  }

  it('returns the command unchanged on POSIX platforms', () => {
    const env = { PATH: '/usr/bin', PATHEXT: '.EXE' }
    expect(resolveCommand('claude', 'linux', env, () => true)).toBe('claude')
    expect(resolveCommand('claude', 'darwin', env, () => true)).toBe('claude')
  })

  it('resolves a bare command to its absolute .exe via PATH + PATHEXT on Windows', () => {
    const env = { PATH: 'C:\\bin;C:\\Users\\me\\.local\\bin', PATHEXT: '.COM;.EXE;.CMD' }
    const resolved = resolveCommand(
      'claude',
      'win32',
      env,
      fakeFs('C:\\Users\\me\\.local\\bin\\claude.exe'),
    )
    expect(resolved.toLowerCase()).toBe('c:\\users\\me\\.local\\bin\\claude.exe')
  })

  it('honours PATHEXT precedence (.exe before .cmd)', () => {
    const env = { PATH: 'C:\\bin', PATHEXT: '.COM;.EXE;.CMD' }
    const resolved = resolveCommand(
      'tool',
      'win32',
      env,
      fakeFs('C:\\bin\\tool.cmd', 'C:\\bin\\tool.exe'),
    )
    expect(resolved.toLowerCase()).toBe('c:\\bin\\tool.exe')
  })

  it('leaves an already path-qualified command untouched on Windows', () => {
    expect(resolveCommand('C:\\bin\\claude.exe', 'win32', {}, () => true)).toBe(
      'C:\\bin\\claude.exe',
    )
    expect(resolveCommand('.\\claude.exe', 'win32', {}, () => true)).toBe('.\\claude.exe')
    expect(resolveCommand('C:/bin/claude.exe', 'win32', {}, () => true)).toBe('C:/bin/claude.exe')
  })

  it('falls back to the bare command when nothing is found on PATH', () => {
    const env = { PATH: 'C:\\bin', PATHEXT: '.EXE' }
    expect(resolveCommand('claude', 'win32', env, () => false)).toBe('claude')
  })
})

describe('spawnAgentProcess', () => {
  it('spawns the selected harness and adds the wrapper id to the inherited environment', () => {
    let call: { command: string; args: string[]; env: Record<string, string> } | undefined
    const spawn = ((command: string, args: string[], options: { env: Record<string, string> }) => {
      call = { command, args, env: options.env }
      return {}
    }) as Parameters<typeof spawnAgentProcess>[0]

    spawnAgentProcess(spawn, 'codex', ['--model', 'gpt-5.4'], 'wrapper-123')

    expect(call).toMatchObject({
      command: 'codex',
      args: ['--model', 'gpt-5.4'],
      env: { OPENMICRO_INSTANCE_ID: 'wrapper-123' },
    })
    expect(call!.env.PATH).toBe(process.env.PATH)
  })

  it('hides HERDR_ENV from the agent so herdr hooks inside it cannot claim the pane', () => {
    const previous = { HERDR_ENV: process.env.HERDR_ENV, HERDR_PANE_ID: process.env.HERDR_PANE_ID }
    process.env.HERDR_ENV = '1'
    process.env.HERDR_PANE_ID = 'w1:p1'
    let env: Record<string, string> | undefined
    const spawn = ((
      _command: string,
      _args: string[],
      options: { env: Record<string, string> },
    ) => {
      env = options.env
      return {}
    }) as Parameters<typeof spawnAgentProcess>[0]

    try {
      spawnAgentProcess(spawn, 'claude', [], 'wrapper-123')
      expect(env!.HERDR_ENV).toBeUndefined()
      expect(env!.HERDR_PANE_ID).toBe('w1:p1')
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('leaves the inherited environment unchanged when no wrapper id is requested', () => {
    const previous = process.env.OPENMICRO_INSTANCE_ID
    process.env.OPENMICRO_INSTANCE_ID = 'existing-value'
    let env: Record<string, string> | undefined
    const spawn = ((
      _command: string,
      _args: string[],
      options: { env: Record<string, string> },
    ) => {
      env = options.env
      return {}
    }) as Parameters<typeof spawnAgentProcess>[0]

    try {
      spawnAgentProcess(spawn, 'claude', [], undefined)
      expect(env!.OPENMICRO_INSTANCE_ID).toBe('existing-value')
    } finally {
      if (previous === undefined) delete process.env.OPENMICRO_INSTANCE_ID
      else process.env.OPENMICRO_INSTANCE_ID = previous
    }
  })
})
