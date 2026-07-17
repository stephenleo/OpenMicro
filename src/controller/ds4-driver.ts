// DualShock 4 report parsing (Bluetooth/USB simple report 0x01). Also covers
// third-party pads in DS4 mode (e.g. GameSir Cyclone 2), which is the
// reliable raw-HID path on macOS — their Switch-mode emulation sends frozen
// reports once the OS claims them.
// Layout verified against a live GameSir Cyclone 2 capture (2026-07).

import type { ButtonId, ControllerEvent } from '../types.js'

export const DS4_VID = 0x054c
// CUH-ZCT1 / CUH-ZCT2 (clones in DS4 mode report one of these too)
export const DS4_PIDS = [0x05c4, 0x09cc]

function axis(raw: number): number {
  return Math.max(-1, Math.min(1, (raw - 128) / 128))
}

/**
 * Parse a DS4 0x01 input report:
 * bytes 1-4 sticks (0-255, center 128); byte 5 low nibble = d-pad hat
 * (0=N clockwise to 7=NW, >=8 released), high nibble = square/cross/circle/
 * triangle bits; byte 6 = L1 R1 L2 R2 Share Options L3 R3; byte 7 low 2 bits =
 * PS/home + touchpad click; bytes 8-9 = trigger analogs.
 */
export function parseDs4Report(data: Buffer): ControllerEvent[] {
  const events: ControllerEvent[] = []
  if (data.length < 10 || data[0] !== 0x01) return events

  events.push({ kind: 'axis', axis: 'left_x', value: axis(data[1]!) })
  events.push({ kind: 'axis', axis: 'left_y', value: axis(data[2]!) })
  events.push({ kind: 'axis', axis: 'right_x', value: axis(data[3]!) })
  events.push({ kind: 'axis', axis: 'right_y', value: axis(data[4]!) })

  const hat = data[5]! & 0x0f
  events.push({ kind: 'button', button: 'dpad_up', pressed: hat === 7 || hat === 0 || hat === 1 })
  events.push({ kind: 'button', button: 'dpad_right', pressed: hat >= 1 && hat <= 3 })
  events.push({ kind: 'button', button: 'dpad_down', pressed: hat >= 3 && hat <= 5 })
  events.push({ kind: 'button', button: 'dpad_left', pressed: hat >= 5 && hat <= 7 })

  // Positional mapping: cross = bottom = south, etc.
  const face = data[5]! >> 4
  const faceMap: Array<[number, ButtonId]> = [
    [0x1, 'west'], // square
    [0x2, 'south'], // cross
    [0x4, 'east'], // circle
    [0x8, 'north'], // triangle
  ]
  for (const [bit, id] of faceMap) {
    events.push({ kind: 'button', button: id, pressed: (face & bit) !== 0 })
  }

  const sys = data[6]!
  const sysMap: Array<[number, ButtonId]> = [
    [0x01, 'l1'],
    [0x02, 'r1'],
    [0x04, 'l2'],
    [0x08, 'r2'],
    [0x10, 'view'], // Share
    [0x20, 'menu'], // Options
    [0x40, 'l3'],
    [0x80, 'r3'],
  ]
  for (const [bit, id] of sysMap) {
    events.push({ kind: 'button', button: id, pressed: (sys & bit) !== 0 })
  }

  // Byte 7 low 2 bits: PS/home (0x01) + touchpad click (0x02). High 6 bits are
  // a report counter on genuine DS4s, so mask them off. Both map to 'touchpad'
  // (openmicro's focus-cycle button) — pads in DS4 mode like the Cyclone 2 have
  // no touchpad, so their home button (0x01) is the only source here.
  events.push({ kind: 'button', button: 'touchpad', pressed: (data[7]! & 0x03) !== 0 })

  events.push({ kind: 'axis', axis: 'l2', value: data[8]! / 255 })
  events.push({ kind: 'axis', axis: 'r2', value: data[9]! / 255 })

  return events
}
