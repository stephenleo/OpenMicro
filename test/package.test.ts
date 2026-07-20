import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
let temp: string

function run(command: string, args: string[], cwd = root, env = process.env): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env })
  expect(result.status, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`).toBe(0)
  return result.stdout
}

describe('packed controller API', () => {
  beforeAll(() => {
    run('npm', ['run', 'build'])
    temp = fs.mkdtempSync(path.join(root, 'node_modules', '.openmicro-package-'))
    run('npm', ['pack', '--ignore-scripts', '--pack-destination', temp], root, {
      ...process.env,
      npm_config_cache: path.join(temp, '.npm-cache'),
    })
    const tarball = fs.readdirSync(temp).find((file) => file.endsWith('.tgz'))
    expect(tarball).toBeDefined()
    const packageDir = path.join(temp, 'node_modules', 'openmicro')
    fs.mkdirSync(packageDir, { recursive: true })
    run('tar', ['-xzf', path.join(temp, tarball!), '-C', packageDir, '--strip-components=1'])
  }, 60_000)

  afterAll(() => {
    fs.rmSync(temp, { force: true, recursive: true })
  })

  it('imports the runtime subpath without CLI side effects', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openmicro-home-'))
    const source = `
process.argv.push('--help')
const api = await import('openmicro/controller')
if (typeof api.HidManager !== 'function') throw new Error('HidManager is not exported')
process.stdout.write(JSON.stringify(Object.keys(api).sort()))
`
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: temp,
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
      timeout: 5000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('["HidManager"]')
    expect(result.stderr).toBe('')
    expect(fs.readdirSync(home)).toEqual([])
    fs.rmSync(home, { force: true, recursive: true })
  })

  it('resolves public runtime and type imports', () => {
    fs.writeFileSync(
      path.join(temp, 'consumer.ts'),
      `import { HidManager, type AxisId, type ButtonId, type ControllerEvent, type ControllerType } from 'openmicro/controller'
const axis: AxisId = 'left_x'
const button: ButtonId = 'south'
const type: ControllerType = 'dualsense'
const event: ControllerEvent = { kind: 'axis', axis, value: 0 }
const manager = new HidManager()
manager.on('data', (value) => {
  const typed: ControllerEvent = value
  void typed
})
manager.stop()
void [button, type, event]
`,
    )

    run(
      path.join(root, 'node_modules', '.bin', 'tsc'),
      [
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2023',
        'consumer.ts',
      ],
      temp,
    )
  })
})
