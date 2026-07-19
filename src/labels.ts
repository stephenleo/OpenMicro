// Human-readable labels for the GUI status log: physical control names per
// controller family (△ vs Y) and friendly action descriptions, so a
// press logs as "△ → push-to-talk" instead of raw keystroke bytes.

import type { Action } from './harness/types.js'
import type { ControlId } from './layers.js'
import type { ControllerType } from './types.js'

const PLAYSTATION_FACE: Record<string, string> = {
  south: '✕',
  east: '○',
  west: '□',
  north: '△',
  menu: 'options',
  view: 'create',
  touchpad: '▭',
}

const XBOX_FACE: Record<string, string> = {
  south: 'A',
  east: 'B',
  west: 'X',
  north: 'Y',
  menu: 'menu',
  view: 'view',
  touchpad: '⌂', // physically the Guide/home button on these pads
}

const COMMON_CONTROLS: Record<string, string> = {
  dpad_up: 'd-pad up',
  dpad_down: 'd-pad down',
  dpad_left: 'd-pad left',
  dpad_right: 'd-pad right',
  l1: 'L1',
  r1: 'R1',
  l2: 'L2',
  r2: 'R2',
  l3: 'L3',
  r3: 'R3',
  touchpad: 'touchpad',
  lstick_up: 'left stick flick up',
  lstick_down: 'left stick flick down',
  lstick_left: 'left stick flick left',
  lstick_right: 'left stick flick right',
  lstick_cw: 'left stick rotate cw',
  lstick_ccw: 'left stick rotate ccw',
  rstick_up: 'right stick flick up',
  rstick_down: 'right stick flick down',
  rstick_left: 'right stick flick left',
  rstick_right: 'right stick flick right',
  rstick_cw: 'right stick rotate cw',
  rstick_ccw: 'right stick rotate ccw',
}

/**
 * Display name for a control, using the connected controller's physical labels.
 *
 * Args:
 *     id (ControlId): Logical control id (button or stick gesture).
 *     controllerType (ControllerType): Connected pad family, from the 'connected' event.
 *
 * Returns:
 *     string: Physical name, e.g. '△' (DualSense) or 'Y' (Xbox/GameSir).
 */
export function controlLabel(id: ControlId, controllerType: ControllerType): string {
  const face =
    controllerType === 'dualsense' || controllerType === 'ds4' ? PLAYSTATION_FACE : XBOX_FACE
  return face[id] ?? COMMON_CONTROLS[id] ?? id
}

const NAMED_KEYS: Record<string, string> = {
  '\x1b[A': 'up arrow',
  '\x1b[B': 'down arrow',
  '\x1b[C': 'right arrow',
  '\x1b[D': 'left arrow',
  '\x1b[Z': 'shift+tab',
  '\r': 'enter',
  '\t': 'tab',
  '\x1b': 'esc',
}

/**
 * Decode a `keys` binding's byte sequence into a readable key name.
 *
 * Args:
 *     bytes (string): Raw byte sequence from a `{ type: 'keys' }` binding.
 *
 * Returns:
 *     string: e.g. 'up arrow', 'ctrl+u', 'ctrl+shift+m'; 'keys' if unrecognized.
 */
function keyName(bytes: string): string {
  const named = NAMED_KEYS[bytes]
  if (named) return named
  // Bare control character: 0x01-0x1a maps to ctrl+a..ctrl+z.
  if (bytes.length === 1) {
    const code = bytes.charCodeAt(0)
    if (code >= 1 && code <= 26) return `ctrl+${String.fromCharCode(96 + code)}`
  }
  // CSI-u encoding: ESC [ <charcode> ; <modifiers+1> u (kitty keyboard protocol).
  const csiU = /^\x1b\[(\d+);(\d+)u$/.exec(bytes)
  if (csiU) {
    const mods = Number(csiU[2]) - 1
    const parts: string[] = []
    if (mods & 4) parts.push('ctrl')
    if (mods & 2) parts.push('alt')
    if (mods & 1) parts.push('shift')
    parts.push(String.fromCharCode(Number(csiU[1])))
    return parts.join('+')
  }
  return 'keys'
}

/**
 * Friendly description of a routed Action for the status log.
 *
 * Args:
 *     action (Action): The action produced by LayerRouter.route.
 *
 * Returns:
 *     string: e.g. 'push-to-talk', 'thinking depth up', 'workflow "debug"'.
 */
export function actionLabel(action: Action): string {
  switch (action.type) {
    case 'accept':
      return 'accept'
    case 'reject':
      return 'reject'
    case 'push_to_talk':
      return 'push-to-talk'
    case 'new_chat':
      return 'new chat'
    case 'thinking_depth':
      return `thinking depth ${action.delta > 0 ? 'up' : 'down'}`
    case 'workflow':
      return `workflow "${action.presetId}"`
    case 'prompt':
      return 'prompt'
    case 'focus_session':
      return action.index === -1 ? 'cycle session' : `focus session ${action.index + 1}`
    case 'layer':
      return `switch to layer ${action.index + 1}`
    case 'herdr_space':
      return 'cycle herdr space'
    case 'keys':
      return `send ${keyName(action.bytes)}`
  }
}
