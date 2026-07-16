import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fixSpawnHelperPermissions, spawnAgentProcess } from '../src/pty.js'

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
