import { describe, expect, it } from 'vitest'
import { Deduper } from '../src/controller/hal.js'
import { parseDs4Report } from '../src/controller/ds4-driver.js'
import { parseGameSirReport } from '../src/controller/gamesir-driver.js'
import { normalizeGenericAxis, parseGenericReport } from '../src/controller/generic-driver.js'
import {
  parseXbox360Report,
  parseXboxBtReport,
  parseXboxGipReport,
  parseXboxReport,
} from '../src/controller/xbox-driver.js'
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

describe('parseGameSirReport', () => {
  // Idle Bluetooth report from the 3537-1022-bluetooth.json fixture.
  function report(overrides: Record<number, number> = {}): Buffer {
    const data = Buffer.from('07808080800f0000000000', 'hex')
    for (const [index, value] of Object.entries(overrides)) data[Number(index)] = value
    return data
  }

  it('ignores reports with the wrong ID or a short length', () => {
    expect(parseGameSirReport(report({ 0: 0x01 }))).toEqual([])
    expect(parseGameSirReport(Buffer.from('0780', 'hex'))).toEqual([])
  })

  it('reports no presses and centered axes at idle', () => {
    const events = parseGameSirReport(report())
    expect([...buttons(events).values()].every((pressed) => !pressed)).toBe(true)
    expect(axes(events).get('left_x')).toBe(0)
    expect(axes(events).get('l2')).toBe(0)
  })

  it('parses the d-pad hat including diagonals and neutral', () => {
    expect(buttons(parseGameSirReport(report({ 5: 0 }))).get('dpad_up')).toBe(true)
    expect(buttons(parseGameSirReport(report({ 5: 1 }))).get('dpad_up')).toBe(true)
    expect(buttons(parseGameSirReport(report({ 5: 1 }))).get('dpad_right')).toBe(true)
    expect(buttons(parseGameSirReport(report({ 5: 6 }))).get('dpad_left')).toBe(true)
    expect(buttons(parseGameSirReport(report({ 5: 0x0f }))).get('dpad_up')).toBe(false)
  })

  it('maps the home button report (0x02) to touchpad', () => {
    expect(buttons(parseGameSirReport(Buffer.from('028000', 'hex'))).get('touchpad')).toBe(true)
    expect(buttons(parseGameSirReport(Buffer.from('020000', 'hex'))).get('touchpad')).toBe(false)
  })

  it('parses sticks and trigger analogs', () => {
    const a = axes(parseGameSirReport(report({ 1: 0xff, 2: 0x00, 8: 0xff, 9: 0x80 })))
    expect(a.get('left_x')).toBeCloseTo(0.99, 2)
    expect(a.get('left_y')).toBe(-1)
    expect(a.get('r2')).toBe(1)
    expect(a.get('l2')).toBeCloseTo(0.5, 2)
  })
})

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

describe('parseXboxGipReport', () => {
  // Real frames captured from a wired Xbox One S (045e:02ea) on macOS.
  const gip = (hex: string): Buffer => Buffer.from(hex, 'hex')

  it('parses face and menu/view buttons from byte 4', () => {
    const a = buttons(parseXboxGipReport(gip('2000e72c1000000000008002f6fc9ffbf400')))
    expect(a.get('south')).toBe(true)
    expect(a.get('east')).toBe(false)
    expect(
      buttons(parseXboxGipReport(gip('2000ea2c2000000000008002f6fc9ffb9b00'))).get('east'),
    ).toBe(true)
    expect(
      buttons(parseXboxGipReport(gip('2000ec2c4000000000008002f6fc9ffb9b00'))).get('west'),
    ).toBe(true)
    expect(
      buttons(parseXboxGipReport(gip('2000ee2c8000000000008002f6fc9ffb9b00'))).get('north'),
    ).toBe(true)
    expect(
      buttons(parseXboxGipReport(gip('2000f42c0400000000008002f6fc9ffb9b00'))).get('menu'),
    ).toBe(true)
    expect(
      buttons(parseXboxGipReport(gip('2000f62c0800000000008002f6fc9ffb9b00'))).get('view'),
    ).toBe(true)
  })

  it('parses bumpers and dpad from byte 5', () => {
    expect(buttons(parseXboxGipReport(gip('2000f02c0010000000008002f6fc9ffb9b00'))).get('l1')).toBe(
      true,
    )
    expect(buttons(parseXboxGipReport(gip('2000f22c0020000000008002f6fc9ffb9b00'))).get('r1')).toBe(
      true,
    )
    const d = buttons(parseXboxGipReport(gip('2000f22c0001000000008002f6fc9ffb9b00')))
    expect(d.get('dpad_up')).toBe(true)
    expect(d.get('dpad_down')).toBe(false)
  })

  it('parses triggers as uint16 LE at bytes 6-9', () => {
    const full = parseXboxGipReport(gip('2000f92c0000ff0300008002f6fc9ffb9b00'))
    expect(axes(full).get('l2')).toBe(1)
    expect(buttons(full).get('l2')).toBe(true)
    const right = parseXboxGipReport(gip('2000fe2c0000000028018002f6fc9ffb9b00'))
    expect(axes(right).get('r2')).toBeCloseTo(296 / 1023, 3)
    expect(buttons(right).get('r2')).toBe(true)
  })

  it('parses sticks as int16 LE at bytes 10-17', () => {
    const data = gip('2000ff2c0000000000008002f6fc9ffb9b00')
    data.writeInt16LE(-32768, 10)
    data.writeInt16LE(32767, 16)
    const a = axes(parseXboxGipReport(data))
    expect(a.get('left_x')).toBe(-1)
    expect(a.get('right_y')).toBe(1)
  })

  it('maps the guide button frame (0x07) to touchpad', () => {
    expect(buttons(parseXboxGipReport(gip('07304c02015b'))).get('touchpad')).toBe(true)
    expect(buttons(parseXboxGipReport(gip('07304d02005b'))).get('touchpad')).toBe(false)
  })

  it('ignores short frames', () => {
    expect(parseXboxGipReport(Buffer.alloc(8))).toEqual([])
    expect(parseXboxGipReport(Buffer.from('0730', 'hex'))).toEqual([])
  })
})

describe('parseXbox360Report', () => {
  // Real frames captured from a wired Xbox 360 Controller (045e:028e) on macOS.
  const x360 = (hex: string): Buffer => Buffer.from(hex, 'hex')

  it('parses face buttons, bumpers and guide from byte 3', () => {
    const cases: Array<[string, string]> = [
      ['001400100000d8f9c2f771094509000000000000', 'south'],
      ['001400200000d8f931f871094509000000000000', 'east'],
      ['001400400000d8f931f871094509000000000000', 'west'],
      ['001400800000d8f931f871094509000000000000', 'north'],
      ['0014000100006cf931f871094509000000000000', 'l1'],
      ['001400020000d8f9c2f771094509000000000000', 'r1'],
      ['0014000400004cf7b3feb60ebd05000000000000', 'touchpad'],
    ]
    for (const [hex, id] of cases) {
      const b = buttons(parseXbox360Report(x360(hex)))
      expect(b.get(id), id).toBe(true)
      expect([...b.values()].filter(Boolean), id).toHaveLength(1)
    }
  })

  it('parses dpad, menu/view and stick clicks from byte 2', () => {
    const cases: Array<[string, string]> = [
      ['0014010000001efba9fb6c14bd05000000000000', 'dpad_up'],
      ['0014020000001efb18fc460ebd05000000000000', 'dpad_down'],
      ['0014040000001efba9fb460ebd05000000000000', 'dpad_left'],
      ['0014080000001efb18fcb60e4c05000000000000', 'dpad_right'],
      ['001410000000d8f9c2f77109d408000000000000', 'menu'],
      ['001420000000d8f9c2f771094509000000000000', 'view'],
      ['001440000000bb0518fc970f6308000000000000', 'l3'],
      ['001480000000a8ef6bf3fa01270a000000000000', 'r3'],
    ]
    for (const [hex, id] of cases) {
      expect(buttons(parseXbox360Report(x360(hex))).get(id), id).toBe(true)
    }
  })

  it('parses triggers as uint8 at bytes 4-5', () => {
    const left = parseXbox360Report(x360('00140000ff004cf7b3fe460ebd05000000000000'))
    expect(axes(left).get('l2')).toBe(1)
    expect(buttons(left).get('l2')).toBe(true)
    expect(buttons(left).get('r2')).toBe(false)
    const right = parseXbox360Report(x360('0014000000ff4cf722ffb60ebd05000000000000'))
    expect(axes(right).get('r2')).toBe(1)
    expect(buttons(right).get('r2')).toBe(true)
  })

  it('parses sticks as int16 LE at bytes 6-13', () => {
    const data = x360('001400000000d8f9c2f771094509000000000000')
    data.writeInt16LE(-32768, 6)
    data.writeInt16LE(32767, 12)
    const a = axes(parseXbox360Report(data))
    expect(a.get('left_x')).toBe(-1)
    expect(a.get('right_y')).toBe(1)
  })

  it('ignores short frames and other message types', () => {
    expect(parseXbox360Report(Buffer.alloc(8))).toEqual([])
    expect(parseXbox360Report(x360('010300'))).toEqual([])
    expect(parseXbox360Report(x360('0814000000000000000000000000000000000000'))).toEqual([])
  })
})

describe('parseXboxBtReport', () => {
  // Real frames captured from an Xbox Wireless Controller (045e:0b20) over Bluetooth.
  const bt = (hex: string): Buffer => Buffer.from(hex, 'hex')
  const idle = '01f783ce825c7da17d0000000000000000'

  it('parses face buttons and bumpers from byte 14', () => {
    expect(buttons(parseXboxBtReport(bt('01f783ce825c7da17d0000000000010000'))).get('south')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce825c7da17d0000000000020000'))).get('east')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce825c7da17d0000000000080000'))).get('west')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce825c7da17d0000000000100000'))).get('north')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000400000'))).get('l1')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000800000'))).get('r1')).toBe(
      true,
    )
    expect([...buttons(parseXboxBtReport(bt(idle))).values()].every((p) => !p)).toBe(true)
  })

  it('parses menu/view/guide and stick clicks from byte 15', () => {
    expect(buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000000800'))).get('menu')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000000400'))).get('view')).toBe(
      true,
    )
    expect(
      buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000001000'))).get('touchpad'),
    ).toBe(true)
    expect(buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000002000'))).get('l3')).toBe(
      true,
    )
    expect(buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000000004000'))).get('r3')).toBe(
      true,
    )
  })

  it('parses the dpad hat at byte 13 including diagonals', () => {
    const d = buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000001000000')))
    expect(d.get('dpad_up')).toBe(true)
    expect(d.get('dpad_down')).toBe(false)
    expect(
      buttons(parseXboxBtReport(bt('01f783ce820e7b377d0000000002000000'))).get('dpad_right'),
    ).toBe(true)
  })

  it('parses triggers as uint16 LE at bytes 9-12', () => {
    const lt = parseXboxBtReport(bt('01f783ce820e7b377dff03000000000000'))
    expect(axes(lt).get('l2')).toBe(1)
    expect(buttons(lt).get('l2')).toBe(true)
    const rt = parseXboxBtReport(bt('01f783ce820e7b377d0000440000000000'))
    expect(axes(rt).get('r2')).toBeCloseTo(68 / 1023, 3)
    expect(buttons(rt).get('r2')).toBe(false)
  })

  it('normalizes sticks from uint16 centred at 0x8000', () => {
    const a = axes(parseXboxBtReport(bt(idle)))
    expect(a.get('left_x')!).toBeCloseTo(0.031, 2)
    expect(Math.abs(a.get('right_y')!)).toBeLessThan(0.02)
    const extremes = bt(idle)
    extremes.writeUInt16LE(0, 1)
    extremes.writeUInt16LE(0xffff, 5)
    const e = axes(parseXboxBtReport(extremes))
    expect(e.get('left_x')).toBe(-1)
    expect(e.get('right_x')!).toBeCloseTo(1, 3)
  })

  it('ignores short reports and wrong report IDs', () => {
    expect(parseXboxBtReport(Buffer.alloc(8))).toEqual([])
    expect(parseXboxBtReport(bt('02f783ce825c7da17d0000000000000000'))).toEqual([])
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

  it('maps byte 7 PS/home + touchpad click to touchpad, ignoring the counter', () => {
    // Real Cyclone 2 capture: home button toggles byte 7 bit 0.
    expect(buttons(parseDs4Report(report('01808080800f00010000'))).get('touchpad')).toBe(true)
    // Genuine DS4 touchpad click is bit 1.
    expect(buttons(parseDs4Report(report('01808080800f00020000'))).get('touchpad')).toBe(true)
    // High bits are a report counter, not a press.
    expect(buttons(parseDs4Report(report('01808080800f00fc0000'))).get('touchpad')).toBe(false)
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
