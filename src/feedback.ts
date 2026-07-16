// Pure mapping from session state to controller output. No side effects — the
// cli (later phase) debounces this and pushes the result through
// `driver.output`.

import type { AgentState } from './harness/types.js'

export interface RGB {
  r: number
  g: number
  b: number
}

export interface SessionSnapshot {
  state: AgentState
}

export interface Feedback {
  lightbar: RGB
  playerLeds: number
}

export const STATE_COLOR: Record<AgentState, RGB> = {
  executing: { r: 0, g: 0, b: 255 }, // blue
  waiting: { r: 255, g: 176, b: 0 }, // amber
  idle: { r: 20, g: 20, b: 20 }, // dim white
  complete: { r: 0, g: 255, b: 0 }, // green
  error: { r: 255, g: 0, b: 0 }, // red
}

const MAX_LEDS = 5

/**
 * Maps session state to controller feedback.
 *
 * Args:
 *     sessions (SessionSnapshot[]): occupied session slots, in slot order.
 *     focusedIndex (number): index into `sessions` of the focused session.
 *     layerColor (RGB): current layer's tint, used as the lightbar color when there is no focused session (e.g. before any session exists).
 *
 * Returns:
 *     Feedback: lightbar color for the focused session's state, and a bitmask of occupied slots (capped at 5 player LEDs).
 */
export function feedbackFor(
  sessions: SessionSnapshot[],
  focusedIndex: number,
  layerColor: RGB,
): Feedback {
  const focused = sessions[focusedIndex]
  const lightbar = focused ? STATE_COLOR[focused.state] : layerColor
  const playerLeds = sessions.slice(0, MAX_LEDS).reduce((mask: number, _s, i) => mask | (1 << i), 0)
  return { lightbar, playerLeds }
}
