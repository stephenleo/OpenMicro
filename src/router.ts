// Input router: current layer + a controller event -> an Action, or null.
// Two responsibilities layered on top of a plain binding lookup:
//
//  1. L1 is a fixed, non-remappable layer-switch modifier (never bound to an
//     Action itself). While held, south/east/west/north/dpad_up/dpad_down
//     jump straight to layer 0-5; that press is consumed, never routed.
//  2. Every layer switch opens a 750ms guard window (ported from vibesense's
//     InputRouter): all button edges and stick-gesture emissions are
//     swallowed during it, and any button already held at the moment of the
//     switch stays dead until it is released and freshly re-pressed.
//
// Stick gestures (flick + rotation, both sticks) are detected here too, then
// fed through the same binding lookup as a synthetic ControlId. KeyRepeater
// integration is not this module's job — the cli calls route() per edge and
// uses the original event's `pressed` flag to drive repeat itself.

import type { Action } from './harness/types.js'
import type { ControlId, OpenMicroConfig } from './layers.js'
import type { AxisId, ButtonId, ControllerEvent } from './types.js'

export const GUARD_WINDOW_MS = 750

const FLICK_ARM_THRESHOLD = 0.75
const FLICK_RELEASE_THRESHOLD = 0.3
const FLICK_WINDOW_MS = 250
const ROTATION_MAGNITUDE_ON = 0.6
const ROTATION_MAGNITUDE_OFF = 0.4
const ROTATION_ENGAGE_RAD = Math.PI / 4 // 45 degrees: once past this, flicks are suppressed
const ROTATION_STEP_RAD = Math.PI / 2 // 90 degrees per emitted cw/ccw tick

// L1 + one of these jumps straight to the mapped layer index. Fixed by
// design, never read from config.
const LAYER_SWITCH_BUTTONS: Partial<Record<ButtonId, number>> = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  dpad_up: 4,
  dpad_down: 5,
}

interface StickIds {
  up: ControlId
  down: ControlId
  left: ControlId
  right: ControlId
  cw: ControlId
  ccw: ControlId
}

const LSTICK_IDS: StickIds = {
  up: 'lstick_up',
  down: 'lstick_down',
  left: 'lstick_left',
  right: 'lstick_right',
  cw: 'lstick_cw',
  ccw: 'lstick_ccw',
}
const RSTICK_IDS: StickIds = {
  up: 'rstick_up',
  down: 'rstick_down',
  left: 'rstick_left',
  right: 'rstick_right',
  cw: 'rstick_cw',
  ccw: 'rstick_ccw',
}

/**
 * Per-stick flick + rotation gesture detector. Axis events arrive one
 * component (x or y) at a time, same as the controller drivers emit them;
 * magnitude/angle are recomputed from the last known x,y pair on every call.
 * Axis convention (matches the drivers/dualsense-ts): x negative = left,
 * positive = right; y negative = up, positive = down.
 */
class StickTracker {
  private x = 0
  private y = 0

  private flickArmed = false
  private flickDirection: ControlId | null = null
  private flickArmedAt = 0

  private angleAccum = 0
  private lastAngle: number | null = null
  private rotating = false

  constructor(private readonly ids: StickIds) {}

  update(component: 'x' | 'y', value: number, now: number): ControlId | null {
    if (component === 'x') this.x = value
    else this.y = value
    const magnitude = Math.hypot(this.x, this.y)

    if (magnitude > ROTATION_MAGNITUDE_ON) {
      const angle = Math.atan2(this.y, this.x)
      if (this.lastAngle !== null) {
        let delta = angle - this.lastAngle
        if (delta > Math.PI) delta -= 2 * Math.PI
        if (delta < -Math.PI) delta += 2 * Math.PI
        this.angleAccum += delta
      }
      this.lastAngle = angle
      if (Math.abs(this.angleAccum) > ROTATION_ENGAGE_RAD) this.rotating = true
    } else if (magnitude < ROTATION_MAGNITUDE_OFF) {
      this.angleAccum = 0
      this.lastAngle = null
      this.rotating = false
    }

    if (this.angleAccum >= ROTATION_STEP_RAD) {
      this.angleAccum -= ROTATION_STEP_RAD
      this.cancelFlick()
      return this.ids.cw
    }
    if (this.angleAccum <= -ROTATION_STEP_RAD) {
      this.angleAccum += ROTATION_STEP_RAD
      this.cancelFlick()
      return this.ids.ccw
    }

    if (this.rotating) {
      this.cancelFlick()
      return null
    }

    if (!this.flickArmed) {
      if (magnitude >= FLICK_ARM_THRESHOLD) {
        this.flickArmed = true
        this.flickArmedAt = now
        this.flickDirection =
          Math.abs(this.x) >= Math.abs(this.y)
            ? this.x >= 0
              ? this.ids.right
              : this.ids.left
            : this.y >= 0
              ? this.ids.down
              : this.ids.up
      }
      return null
    }

    if (now - this.flickArmedAt > FLICK_WINDOW_MS) {
      this.cancelFlick()
      return null
    }
    if (magnitude < FLICK_RELEASE_THRESHOLD) {
      const direction = this.flickDirection
      this.cancelFlick()
      return direction
    }
    return null
  }

  private cancelFlick(): void {
    this.flickArmed = false
    this.flickDirection = null
  }
}

export interface RouterOptions {
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number
  onLayerChange?: (index: number) => void
}

export class LayerRouter {
  private layer = 0
  private guardUntil = 0
  private readonly held = new Set<ButtonId>()
  private ignoredHeld = new Set<ButtonId>()
  private l1Held = false
  private readonly now: () => number
  private readonly leftStick = new StickTracker(LSTICK_IDS)
  private readonly rightStick = new StickTracker(RSTICK_IDS)

  /** Fires after a layer switch actually changes the current layer. */
  onLayerChange: ((index: number) => void) | null

  /** ControlId of the binding matched by the most recent route() that returned an Action — lets the cli log the physical control (a stick gesture id is otherwise invisible to it). */
  lastControl: ControlId | null = null

  constructor(
    private readonly config: OpenMicroConfig,
    options: RouterOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.onLayerChange = options.onLayerChange ?? null
  }

  get currentLayer(): number {
    return this.layer
  }

  /** Switch layer from a bound `{ type: 'layer' }` action (opens the same guard window). */
  setLayer(index: number): void {
    this.switchLayer(index)
  }

  route(event: ControllerEvent): Action | null {
    if (event.kind === 'button') return this.routeButton(event.button, event.pressed)
    if (event.kind === 'axis') return this.routeAxis(event.axis, event.value)
    return null
  }

  private switchLayer(index: number): void {
    const changed = index !== this.layer
    this.layer = index
    this.guardUntil = this.now() + GUARD_WINDOW_MS
    // Buttons already held at the moment of the flip stay dead until released
    // and freshly re-pressed (ported from vibesense's InputRouter.setMode).
    this.ignoredHeld = new Set(this.held)
    if (changed) this.onLayerChange?.(index)
  }

  private lookup(id: ControlId): Action | null {
    const action = this.config.layers[this.layer]?.bindings[id] ?? null
    if (action) this.lastControl = id
    return action
  }

  private routeButton(button: ButtonId, pressed: boolean): Action | null {
    if (button === 'l1') {
      this.l1Held = pressed
      return null // pure layer-switch modifier, never itself bound to an Action
    }

    if (pressed) {
      this.held.add(button)
      if (this.l1Held) {
        const index = LAYER_SWITCH_BUTTONS[button]
        if (index !== undefined) {
          this.switchLayer(index)
          return null // the l1-held press is consumed, never routed as a binding
        }
      }
    } else {
      this.held.delete(button)
      if (this.ignoredHeld.delete(button)) return null // swallow release of a pre-switch press
    }

    if (this.ignoredHeld.has(button)) return null
    if (this.now() < this.guardUntil) return null

    return this.lookup(button)
  }

  private routeAxis(axis: AxisId, value: number): Action | null {
    const now = this.now()
    let gesture: ControlId | null = null
    switch (axis) {
      case 'left_x':
        gesture = this.leftStick.update('x', value, now)
        break
      case 'left_y':
        gesture = this.leftStick.update('y', value, now)
        break
      case 'right_x':
        gesture = this.rightStick.update('x', value, now)
        break
      case 'right_y':
        gesture = this.rightStick.update('y', value, now)
        break
      default:
        return null // l2/r2 triggers: unbound by default, no stick gesture here
    }
    if (!gesture) return null
    if (now < this.guardUntil) return null // gesture emissions are swallowed during the guard window
    return this.lookup(gesture)
  }
}
