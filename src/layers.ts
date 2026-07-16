// User config: 6 remappable layers + workflow prompt presets, persisted at
// ~/.openmicro/config.json (zod-validated, atomic tmp+rename like
// hooks-install.ts). Layer 0 ships the Codex Micro parity bindings from
// PLAN.md; layers 1-5 are blank canvases the user fills in via the config
// file. A missing file self-seeds with DEFAULT_CONFIG; an invalid file is
// never touched — loadConfig throws instead, so a typo can't be silently
// clobbered.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { RGB } from './feedback.js'
import type { Action } from './harness/types.js'
import type { ButtonId } from './types.js'

export type StickControlId =
  | 'lstick_up'
  | 'lstick_down'
  | 'lstick_left'
  | 'lstick_right'
  | 'lstick_cw'
  | 'lstick_ccw'
  | 'rstick_up'
  | 'rstick_down'
  | 'rstick_left'
  | 'rstick_right'
  | 'rstick_cw'
  | 'rstick_ccw'

export type ControlId = ButtonId | StickControlId

export interface Layer {
  name: string
  color: RGB
  bindings: Partial<Record<ControlId, Action>>
}

export interface OpenMicroConfig {
  /** Exactly 6 layers, index = layer number (0-5). */
  layers: [Layer, Layer, Layer, Layer, Layer, Layer]
  /** presetId -> prompt template text, referenced by `{ type: 'workflow', presetId }` bindings. */
  workflows: Record<string, string>
}

const CONTROL_IDS: readonly ControlId[] = [
  'south',
  'east',
  'west',
  'north',
  'dpad_up',
  'dpad_down',
  'dpad_left',
  'dpad_right',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'menu',
  'view',
  'touchpad',
  'lstick_up',
  'lstick_down',
  'lstick_left',
  'lstick_right',
  'lstick_cw',
  'lstick_ccw',
  'rstick_up',
  'rstick_down',
  'rstick_left',
  'rstick_right',
  'rstick_cw',
  'rstick_ccw',
]
const CONTROL_ID_SET: ReadonlySet<string> = new Set(CONTROL_IDS)

const rgbSchema = z.object({ r: z.number(), g: z.number(), b: z.number() })

// Mirrors src/harness/types.ts `Action` exactly. Kept in sync by hand — the
// harness contract is the source of truth and rarely changes.
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('accept') }),
  z.object({ type: z.literal('reject') }),
  z.object({ type: z.literal('push_to_talk') }),
  z.object({ type: z.literal('new_chat') }),
  z.object({ type: z.literal('thinking_depth'), delta: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal('workflow'), presetId: z.string() }),
  z.object({ type: z.literal('prompt'), text: z.string() }),
  z.object({ type: z.literal('focus_session'), index: z.number() }),
  z.object({ type: z.literal('layer'), index: z.number() }),
  z.object({ type: z.literal('keys'), bytes: z.string() }),
])

// z.record with an enum key schema requires every enum key present (not what
// we want for a Partial<Record<...>>), so validate keys loosely + a refine.
const bindingsSchema = z
  .record(z.string(), actionSchema)
  .refine((bindings) => Object.keys(bindings).every((key) => CONTROL_ID_SET.has(key)), {
    message: `binding keys must be one of: ${CONTROL_IDS.join(', ')}`,
  })

const layerSchema = z.object({
  name: z.string(),
  color: rgbSchema,
  bindings: bindingsSchema,
})

const configSchema = z.object({
  layers: z.array(layerSchema).length(6),
  workflows: z.record(z.string(), z.string()),
})

// touchpad cycles focus across occupied session slots. `focus_session` is a
// core-handled action (never reaches a Harness); index -1 is a sentinel this
// binding uses to mean "cycle to the next session" rather than "jump to slot N".
const TOUCHPAD_CYCLE: Action = { type: 'focus_session', index: -1 }

const LAYER_COLORS: RGB[] = [
  { r: 255, g: 255, b: 255 }, // Layer 1 (default) — white
  { r: 160, g: 32, b: 240 }, // Layer 2 — purple
  { r: 0, g: 255, b: 255 }, // Layer 3 — cyan
  { r: 255, g: 140, b: 0 }, // Layer 4 — orange
  { r: 255, g: 20, b: 147 }, // Layer 5 — pink
  { r: 255, g: 255, b: 0 }, // Layer 6 — yellow
]

function blankLayer(index: number): Layer {
  return { name: `Layer ${index + 1}`, color: LAYER_COLORS[index]!, bindings: {} }
}

export const DEFAULT_CONFIG: OpenMicroConfig = {
  layers: [
    {
      name: 'Layer 1',
      color: LAYER_COLORS[0]!,
      bindings: {
        south: { type: 'accept' },
        east: { type: 'reject' },
        north: { type: 'push_to_talk' },
        west: { type: 'new_chat' },
        dpad_up: { type: 'keys', bytes: '\x1b[A' },
        dpad_down: { type: 'keys', bytes: '\x1b[B' },
        dpad_right: { type: 'keys', bytes: '\x1b[C' },
        dpad_left: { type: 'keys', bytes: '\x1b[D' },
        lstick_up: { type: 'workflow', presetId: 'review-pr' },
        lstick_down: { type: 'workflow', presetId: 'debug' },
        lstick_left: { type: 'workflow', presetId: 'refactor' },
        lstick_right: { type: 'workflow', presetId: 'write-tests' },
        rstick_cw: { type: 'thinking_depth', delta: 1 },
        rstick_ccw: { type: 'thinking_depth', delta: -1 },
        touchpad: TOUCHPAD_CYCLE,
      },
    },
    blankLayer(1),
    blankLayer(2),
    blankLayer(3),
    blankLayer(4),
    blankLayer(5),
  ],
  workflows: {
    'review-pr':
      'Review this PR for correctness, security, and style issues. Cite file paths and line numbers, and call out anything you are unsure about.',
    debug:
      'Help me debug the current issue. Start by asking what is failing and what you have already tried, then investigate the root cause before proposing a fix.',
    refactor:
      'Refactor the current code for clarity and simplicity without changing its behavior. Explain each change and keep the diff minimal.',
    'write-tests':
      'Write tests for the current code, covering the happy path plus the edge cases most likely to break in production.',
  },
}

function defaultConfigPath(): string {
  return path.join(os.homedir(), '.openmicro', 'config.json')
}

/**
 * Atomically write a config to disk (tmp file + rename, same pattern as hooks-install.ts).
 *
 * Args:
 *     config (OpenMicroConfig): Config to persist.
 *     configPath (string): Target path. Defaults to ~/.openmicro/config.json.
 *
 * Returns:
 *     None.
 */
export function saveConfig(
  config: OpenMicroConfig,
  configPath: string = defaultConfigPath(),
): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  const tmp = `${configPath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, configPath)
}

/**
 * Load the config, seeding a fresh DEFAULT_CONFIG file when none exists.
 *
 * Args:
 *     configPath (string): Target path. Defaults to ~/.openmicro/config.json.
 *
 * Returns:
 *     OpenMicroConfig: The loaded (or freshly-seeded default) config.
 *
 * Throws:
 *     Error: The file exists but is not valid JSON or fails schema validation. The file is left untouched.
 */
export function loadConfig(configPath: string = defaultConfigPath()): OpenMicroConfig {
  let raw: string
  try {
    raw = fs.readFileSync(configPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      saveConfig(DEFAULT_CONFIG, configPath)
      return DEFAULT_CONFIG
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `openmicro: config at ${configPath} is not valid JSON: ${(err as Error).message}`,
    )
  }

  const result = configSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`openmicro: invalid config at ${configPath}:\n${issues.join('\n')}`)
  }
  return result.data as OpenMicroConfig
}
