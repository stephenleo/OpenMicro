import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installClaudeHooks, installCodexHooks } from '../src/hooks-install.js'

let dir: string
let settingsPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmicro-hooks-'))
  settingsPath = path.join(dir, 'settings.json')
})

afterEach(() => {
  delete process.env.CODEX_HOME
  fs.rmSync(dir, { recursive: true, force: true })
})

function read(): {
  hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
  [key: string]: unknown
} {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
}

describe('installClaudeHooks', () => {
  it('creates settings.json with all openmicro hook events', () => {
    expect(installClaudeHooks(settingsPath)).toBe('changed')
    const settings = read()
    for (const event of [
      'UserPromptSubmit',
      'Stop',
      'Notification',
      'PreToolUse',
      'PostToolUse',
      'SessionEnd',
    ]) {
      expect(settings.hooks[event], event).toHaveLength(1)
      expect(settings.hooks[event]![0]!.hooks[0]!.command).toContain(`/om-hook/${event}`)
    }
    expect(settings.hooks.PreToolUse![0]!.matcher).toBe('AskUserQuestion')
  })

  it('uses port 48762 and the /om-hook/ path — never the bare /hook/ marker', () => {
    installClaudeHooks(settingsPath)
    const command = read().hooks.Stop![0]!.hooks[0]!.command
    expect(command).toBe(
      "curl -s --max-time 1 -X POST http://127.0.0.1:48762/om-hook/Stop -H 'Content-Type: application/json' -d @- >/dev/null 2>&1 || true",
    )
    // Coexistence guard: vibesense purges any command containing the bare
    // substring `/hook/`. Ours must never contain it.
    expect(command.includes('/hook/')).toBe(false)
  })

  it('is idempotent — running twice yields an identical file', () => {
    installClaudeHooks(settingsPath)
    const first = fs.readFileSync(settingsPath, 'utf8')
    expect(installClaudeHooks(settingsPath)).toBe('unchanged')
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(first)
  })

  it('preserves foreign settings and foreign hooks — including a vibesense /hook/ entry', () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        model: 'opus',
        hooks: {
          Stop: [
            { matcher: '', hooks: [{ type: 'command', command: '/my/other/hook.sh' }] },
            // A vibesense entry (bare /hook/, port 48753). Must survive untouched.
            {
              hooks: [
                { type: 'command', command: 'curl http://127.0.0.1:48753/hook/Stop >/dev/null' },
              ],
            },
          ],
        },
      }),
    )
    installClaudeHooks(settingsPath)
    const settings = read()
    expect(settings.model).toBe('opus')
    const stopCommands = settings.hooks.Stop!.flatMap((g) => g.hooks.map((h) => h.command))
    expect(stopCommands).toContain('/my/other/hook.sh')
    expect(stopCommands).toContain('curl http://127.0.0.1:48753/hook/Stop >/dev/null') // vibesense entry preserved
    expect(stopCommands.some((c) => c.includes('/om-hook/Stop'))).toBe(true)
  })

  it('replaces stale openmicro entries instead of accumulating them', () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: 'curl http://127.0.0.1:48762/om-hook/Stop-old' }],
            },
          ],
        },
      }),
    )
    installClaudeHooks(settingsPath)
    installClaudeHooks(settingsPath)
    expect(read().hooks.Stop).toHaveLength(1)
  })

  it('leaves an unparseable settings.json untouched', () => {
    fs.writeFileSync(settingsPath, '{not json')
    installClaudeHooks(settingsPath)
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{not json')
  })
})

describe('installCodexHooks', () => {
  it('creates exactly the four Codex lifecycle hooks with safe command output', () => {
    expect(installCodexHooks(settingsPath)).toBe('changed')
    const settings = read()
    expect(Object.keys(settings.hooks).sort()).toEqual(
      ['PermissionRequest', 'PostToolUse', 'Stop', 'UserPromptSubmit'].sort(),
    )
    for (const [event, groups] of Object.entries(settings.hooks)) {
      expect(groups).toHaveLength(1)
      expect(groups[0]!.matcher, event).toBeUndefined()
      const command = groups[0]!.hooks[0]!.command
      expect(command).toContain(`/om-hook/${event}`)
      expect(command).toContain('X-Openmicro-Instance-Id: $OPENMICRO_INSTANCE_ID')
      expect(command).toContain("printf '{}'")
      expect(command.includes('/hook/')).toBe(false) // coexistence guard
    }
  })

  it('is byte-idempotent and reports unchanged on the second install', () => {
    expect(installCodexHooks(settingsPath)).toBe('changed')
    const first = fs.readFileSync(settingsPath, 'utf8')
    expect(installCodexHooks(settingsPath)).toBe('unchanged')
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(first)
  })

  it('uses CODEX_HOME and preserves foreign data and hooks', () => {
    process.env.CODEX_HOME = dir
    settingsPath = path.join(dir, 'hooks.json')
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        custom: true,
        hooks: { Stop: [{ hooks: [{ type: 'command', command: '/other/stop-hook' }] }] },
      }),
    )
    expect(installCodexHooks()).toBe('changed')
    const settings = read()
    expect(settings.custom).toBe(true)
    expect(settings.hooks.Stop).toHaveLength(2)
  })

  it('replaces stale openmicro entries but keeps vibesense and arbitrary webhooks', () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: 'command', command: 'curl http://127.0.0.1:48762/om-hook/Stop >/dev/null' },
              ],
            },
            // vibesense codex entry — different header + port, must survive.
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'curl http://127.0.0.1:48753/hook/Stop -H "X-Vibesense-Instance-Id: $VIBESENSE_INSTANCE_ID"',
                },
              ],
            },
            { hooks: [{ type: 'command', command: 'curl https://example.com/hook/Stop' }] },
          ],
        },
      }),
    )
    installCodexHooks(settingsPath)
    const stop = read().hooks.Stop!
    const commands = stop.flatMap((g) => g.hooks.map((h) => h.command))
    expect(commands).toContain(
      'curl http://127.0.0.1:48753/hook/Stop -H "X-Vibesense-Instance-Id: $VIBESENSE_INSTANCE_ID"',
    )
    expect(commands).toContain('curl https://example.com/hook/Stop')
    // exactly one fresh openmicro entry (the stale one replaced)
    expect(commands.filter((c) => c.includes('X-Openmicro-Instance-Id'))).toHaveLength(1)
  })

  it('leaves invalid JSON untouched and reports failure', () => {
    fs.writeFileSync(settingsPath, '{broken')
    expect(installCodexHooks(settingsPath)).toBe('failed')
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{broken')
  })
})
