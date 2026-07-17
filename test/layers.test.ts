import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../src/layers.js'
import type { OpenMicroConfig } from '../src/layers.js'

let dir: string
let configPath: string
let realHome: string | undefined

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmicro-config-'))
  configPath = path.join(dir, 'config.json')
  realHome = process.env.HOME
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (realHome !== undefined) process.env.HOME = realHome
})

describe('loadConfig / saveConfig', () => {
  it('creates DEFAULT_CONFIG when the file does not exist', () => {
    expect(fs.existsSync(configPath)).toBe(false)
    const config = loadConfig(configPath)
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(fs.existsSync(configPath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual(DEFAULT_CONFIG)
  })

  it('ships R1 mode-cycle and R2 clear-input defaults on Layer 1', () => {
    expect(DEFAULT_CONFIG.layers[0].bindings.r1).toEqual({ type: 'keys', bytes: '\x1b[Z' })
    expect(DEFAULT_CONFIG.layers[0].bindings.r2).toEqual({ type: 'keys', bytes: '\x15' })
  })

  it('defaults to ~/.openmicro/config.json, respecting a HOME override', () => {
    process.env.HOME = dir
    const config = loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(fs.existsSync(path.join(dir, '.openmicro', 'config.json'))).toBe(true)
  })

  it('round-trips a saved config exactly', () => {
    const custom: OpenMicroConfig = {
      ...DEFAULT_CONFIG,
      layers: [
        { name: 'My Layer', color: { r: 1, g: 2, b: 3 }, bindings: { south: { type: 'accept' } } },
        ...DEFAULT_CONFIG.layers.slice(1),
      ] as OpenMicroConfig['layers'],
      workflows: { custom: 'do the thing' },
    }
    saveConfig(custom, configPath)
    expect(loadConfig(configPath)).toEqual(custom)
  })

  it('writes atomically via a tmp file that is renamed into place', () => {
    saveConfig(DEFAULT_CONFIG, configPath)
    const entries = fs.readdirSync(dir)
    expect(entries).toEqual(['config.json'])
  })

  it('throws a clear error on invalid JSON and never touches the file', () => {
    fs.writeFileSync(configPath, '{ not json')
    expect(() => loadConfig(configPath)).toThrow(/not valid JSON/)
    expect(fs.readFileSync(configPath, 'utf8')).toBe('{ not json')
  })

  it('throws a clear error on schema-invalid config and never touches the file', () => {
    const bad = JSON.stringify({ layers: [], workflows: {} })
    fs.writeFileSync(configPath, bad)
    expect(() => loadConfig(configPath)).toThrow(/invalid config/)
    expect(fs.readFileSync(configPath, 'utf8')).toBe(bad)
  })

  it('rejects an unknown binding key', () => {
    const bad = JSON.stringify({
      layers: [
        {
          name: 'L1',
          color: { r: 0, g: 0, b: 0 },
          bindings: { not_a_control: { type: 'accept' } },
        },
        ...DEFAULT_CONFIG.layers.slice(1),
      ],
      workflows: {},
    })
    fs.writeFileSync(configPath, bad)
    expect(() => loadConfig(configPath)).toThrow(/invalid config/)
  })
})
