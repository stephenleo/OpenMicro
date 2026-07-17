import { describe, expect, it } from 'vitest'
import { Deduper } from '../src/controller/hal.js'
import { parseDs4Report } from '../src/controller/ds4-driver.js'
import { normalizeGenericAxis, parseGenericReport } from '../src/controller/generic-driver.js'
import { parseXboxReport } from '../src/controller/xbox-driver.js'
import type { ControllerEvent } from '../src/types.js'

function buttons(events: ControllerEvent[]): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const e of events) if (e.kind === 'button') map.set(e.button, e.pressed)
  return map
}

function axes(events: ControllerEvent[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of events) if (e.kind === 'axis') map.set(e.axis, e.value)
  return map
}

describe('parseXboxReport', () => {
  function report(overrides: Record<number, number> = {}): Buffer {
    const data = Buffer.alloc(16)
    for (const [index, value] of Object.entries(overrides)) data[Number(index)] = value
    return data
  }

  it('parses face buttons from byte 2', () => {
    const b = buttons(parseXboxReport(report({ 2: 0x01 | 0x08 })))
    expect(b.get('south')).toBe(true)
    expect(b.get('north')).toBe(true)
    expect(b.get('east')).toBe(false)
    expect(b.get('west')).toBe(false)
  })

  it('parses the d-pad hat value including diagonals', () => {
    expect(buttons(parseXboxReport(report({ 3: 1 }))).get('dpad_up')).toBe(true)
    expect(buttons(parseXboxReport(report({ 3: 2 }))).get('dpad_up')).toBe(true)
    expect(buttons(parseXboxReport(report({ 3: 2 }))).get('dpad_right')).toBe(true)
    expect(buttons(parseXboxReport(report({ 3: 5 }))).get('dpad_down')).toBe(true)
    expect(buttons(parseXboxReport(report({ 3: 0 }))).get('dpad_up')).toBe(false)
  })

  it('treats a >25% trigger as an r2 button press', () => {
    const pressed = report({ 6: 0xff, 7: 0x03 }) // 1023 = fully pulled
    expect(buttons(parseXboxReport(pressed)).get('r2')).toBe(true)
    expect(axes(parseXboxReport(pressed)).get('r2')).toBe(1)
    const soft = report({ 6: 0x40, 7: 0x01 }) // 320/1023 ≈ 31% — a soft tap
    expect(buttons(parseXboxReport(soft)).get('r2')).toBe(true)
    expect(buttons(parseXboxReport(report({ 6: 0xc8 }))).get('r2')).toBe(false) // 200/1023 ≈ 20%
    expect(buttons(parseXboxReport(report())).get('r2')).toBe(false)
  })

  it('normalizes stick int16 values to -1..1', () => {
    const data = report()
    data.writeInt16LE(-32768, 8)
    data.writeInt16LE(32767, 10)
    const a = axes(parseXboxReport(data))
    expect(a.get('left_x')).toBe(-1)
    expect(a.get('left_y')).toBe(1)
  })

  it('returns nothing for short reports', () => {
    expect(parseXboxReport(Buffer.alloc(8))).toEqual([])
  })
})

describe('parseGenericReport', () => {
  it('parses button bitmask and centered axes', () => {
    const events = parseGenericReport(Buffer.from([0b00000001, 0, 0, 255, 128, 0]))
    expect(buttons(events).get('south')).toBe(true)
    expect(buttons(events).get('east')).toBe(false)
    expect(axes(events).get('left_y')).toBeCloseTo(0.992, 2)
    expect(axes(events).get('right_x')).toBe(0)
  })

  it('normalizeGenericAxis centers at 128', () => {
    expect(normalizeGenericAxis(128)).toBe(0)
    expect(normalizeGenericAxis(0)).toBe(-1)
    expect(normalizeGenericAxis(255)).toBeCloseTo(0.992, 2)
  })
})

describe('parseDs4Report', () => {
  // Fixtures are real reports captured from a GameSir Cyclone 2 in DS4 mode.
  const report = (hex: string) => Buffer.from(hex, 'hex')

  it('parses the idle report: nothing pressed, sticks centered', () => {
    const events = parseDs4Report(report('01808080800f00000000'))
    expect(events.filter((e) => e.kind === 'button' && e.pressed)).toEqual([])
    expect(axes(events).get('left_x')).toBe(0)
    expect(axes(events).get('r2')).toBe(0)
  })

  it('parses the d-pad hat nibble', () => {
    expect(buttons(parseDs4Report(report('01808080800000000000'))).get('dpad_up')).toBe(true)
    expect(buttons(parseDs4Report(report('01808080800200000000'))).get('dpad_right')).toBe(true)
    expect(buttons(parseDs4Report(report('01808080800400000000'))).get('dpad_down')).toBe(true)
    expect(buttons(parseDs4Report(report('01808080800600000000'))).get('dpad_left')).toBe(true)
    const diagonal = buttons(parseDs4Report(report('01808080800100000000')))
    expect(diagonal.get('dpad_up')).toBe(true)
    expect(diagonal.get('dpad_right')).toBe(true)
  })

  it('parses face buttons positionally (cross=south, circle=east, …)', () => {
    expect(buttons(parseDs4Report(report('01808080801f00000000'))).get('west')).toBe(true) // square
    expect(buttons(parseDs4Report(report('01808080802f00000000'))).get('south')).toBe(true) // cross
    expect(buttons(parseDs4Report(report('01808080804f00000000'))).get('east')).toBe(true) // circle
    expect(buttons(parseDs4Report(report('01808080808f00000000'))).get('north')).toBe(true) // triangle
  })

  it('parses triggers as button + analog axis', () => {
    const l2 = parseDs4Report(report('01808080800f0400ff00'))
    expect(buttons(l2).get('l2')).toBe(true)
    expect(axes(l2).get('l2')).toBe(1)
    const r2 = parseDs4Report(report('01808080800f080000ff'))
    expect(buttons(r2).get('r2')).toBe(true)
    expect(axes(r2).get('r2')).toBe(1)
  })

  it('parses stick extremes', () => {
    const events = parseDs4Report(report('0100ff80800f00000000'))
    expect(axes(events).get('left_x')).toBe(-1)
    expect(axes(events).get('left_y')).toBeCloseTo(0.99, 1)
  })

  it('ignores non-0x01 and short reports', () => {
    expect(parseDs4Report(report('11808080800f00000000'))).toEqual([])
    expect(parseDs4Report(report('018080'))).toEqual([])
  })
})

describe('Deduper', () => {
  it('passes state changes and drops repeats', () => {
    const d = new Deduper()
    const press: ControllerEvent = { kind: 'button', button: 'south', pressed: true }
    expect(d.filter(press)).toEqual(press)
    expect(d.filter(press)).toBeNull()
    expect(d.filter({ kind: 'button', button: 'south', pressed: false })).not.toBeNull()
  })

  it('resets state on disconnect so reconnect re-emits', () => {
    const d = new Deduper()
    const press: ControllerEvent = { kind: 'button', button: 'south', pressed: true }
    d.filter(press)
    d.filter({ kind: 'disconnected' })
    expect(d.filter(press)).toEqual(press)
  })
})

describe('RawHidDriver', () => {
  it('emits disconnected when the device cannot be opened', async () => {
    const { RawHidDriver } = await import('../src/controller/raw-hid-driver.js')
    const driver = new RawHidDriver('generic-hid', 'not-a-real-path', () => [])
    const events: ControllerEvent[] = []
    driver.on('data', (e: ControllerEvent) => events.push(e))
    driver.start()
    expect(events).toEqual([{ kind: 'disconnected' }])
  })
})
