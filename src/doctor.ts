// `openmicro doctor` — a standalone controller diagnostic. No agent is wrapped
// and no host server is bound: it just detects the pad, walks an interactive
// checklist over readline, and writes a report that IS the test-fixture file
// (same schema, drop it straight into test/fixtures/controllers/ and PR it).
//
// Raw HID capture: raw-hid drivers emit a `report` event with the buffer that
// produced each batch of parsed events. Doctor snapshots the last report so a
// passing button press records the exact bytes — the data needed to write or
// verify a parse function without the hardware in hand. The DualSense path
// goes through dualsense-ts, which exposes no raw report, so those captures are
// omitted and noted as `parser: dualsense-ts`.

import type { EventEmitter } from 'node:events'
import { readFileSync, writeFileSync } from 'node:fs'
import { release, version } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Interface as Readline } from 'node:readline'
import { HID, devices } from 'node-hid'
import type { Device } from 'node-hid'
import { createDriver, DUALSENSE_PIDS, DUALSENSE_VID } from './controller/hid-manager.js'
import type { ControllerHAL } from './controller/hal.js'
import { DS4_PIDS, DS4_VID } from './controller/ds4-driver.js'
import { XBOX_PIDS, XBOX_VID } from './controller/xbox-driver.js'
import type { AxisId, ButtonId, ControllerEvent, ControllerType } from './types.js'

const PROMPT_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 4_000
const PLAYER_LED_PATTERN = 0b10101 // outer pair + centre — an obvious, asymmetric shape

/** Controls to walk, in the order the spec lists them. */
const BUTTON_ORDER: ButtonId[] = [
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
]

const AXIS_ORDER: AxisId[] = ['left_x', 'left_y', 'right_x', 'right_y', 'l2', 'r2']

type ControlStatus = 'pass' | 'fail' | 'skip' | 'capture'

interface Capture {
  pressed: string
  idle: string
}

interface ControlResult {
  status: ControlStatus
  capture?: Capture
}

interface AxisRange {
  min: number
  max: number
}

/** Report schema — also the fixture schema (schemaVersion pins it). */
export interface DoctorReport {
  schemaVersion: 1
  openmicroVersion: string
  platform: string
  osVersion: string
  controller: {
    vid: string
    pid: string
    product: string
    transport: string
    driver: string
  }
  results: Record<string, ControlResult>
  axes: Record<string, AxisRange>
  output: Record<string, string> | 'unsupported'
  timestamp: string
}

/** Read this package's version from its package.json (dist and src both sit one level under root). */
function packageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Format a VID/PID number as a 0x-prefixed 4-digit hex string. */
function hex16(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0')
}

/**
 * Best-effort transport guess from node-hid device info.
 *
 * Heuristic: HID `interface` is >= 0 for a claimed USB interface and -1 for a
 * Bluetooth-attached device on macOS/Linux. Not authoritative — hardware pass
 * needed to confirm across pads/OSes.
 */
function transportFor(device: Device): 'usb' | 'bluetooth' | 'unknown' {
  if (device.interface >= 0) return 'usb'
  if (device.interface < 0) return 'bluetooth'
  return 'unknown'
}

/** Map a driver's controllerType to the report's driver name (generic-hid → generic). */
function driverName(type: ControllerType): string {
  return type === 'generic-hid' ? 'generic' : type
}

/** Find the node-hid Device the active driver claimed, for VID/PID/product/transport display. */
function findDevice(type: ControllerType): Device | undefined {
  const all = devices()
  if (type === 'dualsense') {
    return all.find((d) => d.vendorId === DUALSENSE_VID && DUALSENSE_PIDS.includes(d.productId))
  }
  if (type === 'ds4') {
    return all.find((d) => d.vendorId === DS4_VID && DS4_PIDS.includes(d.productId))
  }
  if (type === 'xbox') {
    return all.find((d) => d.vendorId === XBOX_VID && XBOX_PIDS.includes(d.productId))
  }
  return all.find((d) => d.usagePage === 0x01 && (d.usage === 0x04 || d.usage === 0x05) && d.path)
}

/** A minimal readline prompt helper: print a question, resolve with the typed line. */
function ask(rl: Readline, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

/** Resolve once the driver emits a `connected` event, or false on timeout. Attach BEFORE start(). */
function waitConnected(bus: EventEmitter, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = (e: ControllerEvent): void => {
      if (e.kind !== 'connected' && e.kind !== 'disconnected') return
      clearTimeout(timer)
      bus.off('data', handler)
      resolve(e.kind === 'connected')
    }
    const timer = setTimeout(() => {
      bus.off('data', handler)
      resolve(false)
    }, ms)
    bus.on('data', handler)
  })
}

interface RawState {
  /** Most recent raw HID report (raw-hid drivers only; null for dualsense-ts). */
  last: Buffer | null
}

/**
 * Wait for a specific button press, or a skip ('s'+enter), or a timeout.
 *
 * Snapshots the idle report when the wait starts and the report at the moment
 * of the press so the pass records the exact idle→pressed byte pair.
 */
function awaitButton(
  bus: EventEmitter,
  rl: Readline,
  id: ButtonId,
  raw: RawState,
): Promise<ControlResult> {
  return new Promise((resolve) => {
    const idle = raw.last
    let done = false
    const finish = (r: ControlResult): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      bus.off('data', onData)
      rl.off('line', onLine)
      resolve(r)
    }
    const onData = (e: ControllerEvent): void => {
      if (e.kind !== 'button' || e.button !== id || !e.pressed) return
      const capture =
        raw.last && idle
          ? { pressed: raw.last.toString('hex'), idle: idle.toString('hex') }
          : undefined
      finish({ status: 'pass', capture })
    }
    const onLine = (line: string): void => {
      if (line.trim().toLowerCase() === 's') finish({ status: 'skip' })
    }
    const timer = setTimeout(() => finish({ status: 'fail' }), PROMPT_TIMEOUT_MS)
    bus.on('data', onData)
    rl.on('line', onLine)
  })
}

/** Walk the button checklist. Returns results plus a count of events seen (0 ⇒ dead driver). */
async function runButtonChecklist(
  bus: EventEmitter,
  rl: Readline,
  raw: RawState,
): Promise<{ results: Record<string, ControlResult>; eventCount: number }> {
  const results: Record<string, ControlResult> = {}
  let eventCount = 0
  const counter = (): void => {
    eventCount += 1
  }
  bus.on('data', counter)
  console.log('\nButton checklist — press each control as prompted (or type "s"+Enter to skip).\n')
  for (const id of BUTTON_ORDER) {
    process.stdout.write(`  ${id.padEnd(11)} → press it… `)
    const result = await awaitButton(bus, rl, id, raw)
    results[id] = result
    console.log(result.status === 'pass' ? 'PASS' : result.status.toUpperCase())
  }
  bus.off('data', counter)
  return { results, eventCount }
}

/** Exercise all sticks/triggers once, recording observed min/max per axis. */
async function runAxisCheck(bus: EventEmitter, rl: Readline): Promise<Record<string, AxisRange>> {
  const ranges: Record<string, AxisRange> = {}
  for (const id of AXIS_ORDER) ranges[id] = { min: 0, max: 0 }
  const onData = (e: ControllerEvent): void => {
    if (e.kind !== 'axis') return
    const r = ranges[e.axis]
    if (!r) return
    r.min = Math.min(r.min, e.value)
    r.max = Math.max(r.max, e.value)
  }
  bus.on('data', onData)
  await ask(
    rl,
    '\nAxes — rotate BOTH sticks through their full range and squeeze BOTH triggers, then press Enter. ',
  )
  bus.off('data', onData)
  return ranges
}

/** DualSense-only output checks: drive the lightbar/LEDs and record y/n answers. */
async function runOutputCheck(
  driver: ControllerHAL,
  rl: Readline,
): Promise<Record<string, string> | 'unsupported'> {
  const output = driver.output
  if (!output) return 'unsupported'
  console.log('\nOutput checks — watch the controller and answer y/n.\n')
  const answers: Record<string, string> = {}
  output.setLightbar({ r: 255, g: 0, b: 0 })
  answers.lightbarRed = (await ask(rl, '  Did the lightbar turn RED? (y/n) ')).trim().toLowerCase()
  output.setLightbar({ r: 0, g: 0, b: 255 })
  answers.lightbarBlue = (await ask(rl, '  Did the lightbar turn BLUE? (y/n) '))
    .trim()
    .toLowerCase()
  output.setPlayerLeds(PLAYER_LED_PATTERN)
  answers.playerLeds = (
    await ask(rl, '  Did the player LEDs light in a pattern (outer pair + centre)? (y/n) ')
  )
    .trim()
    .toLowerCase()
  return answers
}

/**
 * Capture-only fallback for an unknown pad: for each control, snapshot an idle
 * report then a held report, saving the byte pair. This is the raw data a
 * maintainer needs to write a parse function without the hardware.
 */
async function runCaptureOnly(path: string, rl: Readline): Promise<Record<string, ControlResult>> {
  const results: Record<string, ControlResult> = {}
  const raw: RawState = { last: null }
  const device = new HID(path)
  device.on('data', (d: Buffer) => {
    raw.last = Buffer.from(d)
  })
  console.log(
    '\nUnknown controller — capture-only mode. For each control we record an idle report and a held report.\n',
  )
  for (const id of BUTTON_ORDER) {
    await ask(rl, `  Release everything, then press Enter to capture IDLE for ${id}. `)
    const idle = raw.last
    await ask(rl, `  Now HOLD ${id} and, while holding, press Enter. `)
    const pressed = raw.last
    results[id] = {
      status: 'capture',
      capture: { idle: idle?.toString('hex') ?? '', pressed: pressed?.toString('hex') ?? '' },
    }
  }
  device.close()
  return results
}

/**
 * Fixture filename from the controller's canonical identity: vid-pid-transport.
 *
 * VID:PID + transport is the tuple that determines the HID report layout, so it is both the fixture's identity and its dedup key — a re-submission of the same controller collides on the filename and becomes a git update to the existing fixture instead of a duplicate. Product strings are display metadata (clone pads lie about them) and live inside the JSON.
 *
 * Args:
 *     vid (string): vendor id as reported, e.g. "0x054c".
 *     pid (string): product id as reported, e.g. "0x0ce6".
 *     transport (string): "usb" | "bluetooth" | "unknown".
 *
 * Returns:
 *     string: e.g. "054c-0ce6-usb.json".
 */
function fixtureName(vid: string, pid: string, transport: string): string {
  const hex = (s: string): string => s.replace(/^0x/, '').toLowerCase() || 'unknown'
  const slug = transport.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown'
  return `${hex(vid)}-${hex(pid)}-${slug}.json`
}

/** Render a compact, paste-ready markdown summary of a report. */
function markdownSummary(report: DoctorReport): string {
  const c = report.controller
  const parserNote = c.driver === 'dualsense' ? ' (parser: dualsense-ts)' : ''
  const lines: string[] = []
  lines.push('### OpenMicro controller report')
  lines.push('')
  lines.push(`- Controller: ${c.product} (VID ${c.vid} / PID ${c.pid})`)
  lines.push(`- Transport: ${c.transport}`)
  lines.push(`- Driver: ${c.driver}${parserNote}`)
  lines.push(`- openmicro ${report.openmicroVersion} · ${report.platform} · ${report.osVersion}`)
  lines.push('')
  lines.push('| Control | Result |')
  lines.push('| --- | --- |')
  for (const [id, r] of Object.entries(report.results)) lines.push(`| ${id} | ${r.status} |`)
  lines.push('')
  const axisBits = Object.entries(report.axes).map(
    ([id, r]) => `${id} [${r.min.toFixed(2)}, ${r.max.toFixed(2)}]`,
  )
  lines.push(`Axes: ${axisBits.join(' · ')}`)
  lines.push(
    `Output: ${report.output === 'unsupported' ? 'unsupported' : JSON.stringify(report.output)}`,
  )
  return lines.join('\n')
}

/**
 * Run the doctor: detect, walk the checklist, write the report/fixture file,
 * and print a paste-ready markdown block.
 */
export async function runDoctor(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const driver = createDriver()

    // ── Unknown controller: no driver claimed it → capture-only fallback. ──
    if (!driver) {
      const candidate = devices().find((d) => d.usagePage === 0x01 && d.path)
      if (!candidate?.path) {
        console.error('No controller detected. Plug one in and rerun `openmicro doctor`.')
        return
      }
      const results = await runCaptureOnly(candidate.path, rl)
      const report = buildReport(
        {
          vid: hex16(candidate.vendorId),
          pid: hex16(candidate.productId),
          product: candidate.product ?? '(unknown)',
          transport: transportFor(candidate),
          driver: 'none',
        },
        results,
        {},
        'unsupported',
      )
      finishReport(report)
      return
    }

    const bus = driver as unknown as EventEmitter
    const raw: RawState = { last: null }
    bus.on('report', (buf: Buffer) => {
      raw.last = Buffer.from(buf)
    })

    const connected = waitConnected(bus, CONNECT_TIMEOUT_MS)
    driver.start()
    if (!(await connected)) {
      console.error(
        'Controller detected but could not be opened. Close any running openmicro sessions (they hold the device) and rerun. Details: ~/.openmicro/openmicro.log',
      )
      return
    }

    const device = findDevice(driver.controllerType)
    const dName = driverName(driver.controllerType)
    console.log('\nController detected:')
    console.log(
      `  VID/PID:   ${device ? `${hex16(device.vendorId)} / ${hex16(device.productId)}` : '?'}`,
    )
    console.log(`  Product:   ${device?.product ?? '(unknown)'}`)
    console.log(`  Transport: ${device ? transportFor(device) : 'unknown'}`)
    console.log(`  Driver:    ${dName}${dName === 'dualsense' ? ' (parser: dualsense-ts)' : ''}`)

    const { results, eventCount } = await runButtonChecklist(bus, rl, raw)
    const axes = await runAxisCheck(bus, rl)
    const output = await runOutputCheck(driver, rl)

    // Generic driver that never emitted an event ⇒ its parser doesn't fit this
    // pad. Offer the capture-only pass so the report still yields useful bytes.
    let finalResults = results
    if (driver.controllerType === 'generic-hid' && eventCount === 0 && device?.path) {
      console.log(
        '\nThe generic parser produced no events for this pad — switching to capture-only.',
      )
      finalResults = await runCaptureOnly(device.path, rl)
    }

    driver.stop()

    const report = buildReport(
      {
        vid: device ? hex16(device.vendorId) : '?',
        pid: device ? hex16(device.productId) : '?',
        product: device?.product ?? '(unknown)',
        transport: device ? transportFor(device) : 'unknown',
        driver: dName,
      },
      finalResults,
      axes,
      output,
    )
    finishReport(report)
  } finally {
    rl.close()
  }
}

/** Assemble a DoctorReport from its parts plus environment metadata. */
function buildReport(
  controller: DoctorReport['controller'],
  results: Record<string, ControlResult>,
  axes: Record<string, AxisRange>,
  output: DoctorReport['output'],
): DoctorReport {
  return {
    schemaVersion: 1,
    openmicroVersion: packageVersion(),
    platform: process.platform,
    osVersion: version() || release(),
    controller,
    results,
    axes,
    output,
    timestamp: new Date().toISOString(),
  }
}

/** Write the report/fixture file to cwd and print the markdown summary + PR hint. */
function finishReport(report: DoctorReport): void {
  const name = fixtureName(
    report.controller.vid,
    report.controller.pid,
    report.controller.transport,
  )
  const path = join(process.cwd(), name)
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n')
  console.log(`\nWrote ${path}`)
  console.log(
    `To contribute: drop ${name} into test/fixtures/controllers/ and open a PR — CI replays its captures automatically.\n`,
  )
  console.log('```markdown')
  console.log(markdownSummary(report))
  console.log('```')
}
