// Hardware abstraction for controllers. Drivers emit ControllerEvents on
// 'data'; consumers never touch node-hid directly. Drivers may re-emit
// unchanged button/axis state every HID report — Deduper edge-filters once,
// centrally, instead of each driver tracking its own previous state.

import type { AxisId, ButtonId, ControllerEvent, ControllerType } from '../types.js'
import type { ControllerOutput } from './output.js'

export interface ControllerHAL {
  readonly controllerType: ControllerType
  readonly output?: ControllerOutput
  on(event: 'data', listener: (e: ControllerEvent) => void): unknown
  start(): void
  stop(): void
}

export class Deduper {
  private buttons = new Map<ButtonId, boolean>()
  private axes = new Map<AxisId, number>()

  /** Returns the event if it changes state, null if it's a repeat of current state. */
  filter(e: ControllerEvent): ControllerEvent | null {
    if (e.kind === 'button') {
      if (this.buttons.get(e.button) === e.pressed) return null
      this.buttons.set(e.button, e.pressed)
      return e
    }
    if (e.kind === 'axis') {
      if (this.axes.get(e.axis) === e.value) return null
      this.axes.set(e.axis, e.value)
      return e
    }
    if (e.kind === 'disconnected') {
      this.buttons.clear()
      this.axes.clear()
    }
    return e
  }
}
