import { describe, expect, it } from 'vitest'
import { actionLabel, controlLabel } from '../src/labels.js'

describe('controlLabel', () => {
  it('uses PlayStation face symbols for dualsense and ds4', () => {
    expect(controlLabel('north', 'dualsense')).toBe('△')
    expect(controlLabel('west', 'dualsense')).toBe('□')
    expect(controlLabel('east', 'dualsense')).toBe('○')
    expect(controlLabel('south', 'ds4')).toBe('✕')
    expect(controlLabel('menu', 'dualsense')).toBe('options')
    expect(controlLabel('touchpad', 'dualsense')).toBe('▭')
    expect(controlLabel('touchpad', 'xbox')).toBe('⌂')
    expect(controlLabel('touchpad', 'gamesir')).toBe('⌂')
  })

  it('uses ABXY face names for xbox, gamesir, and generic pads', () => {
    expect(controlLabel('north', 'xbox')).toBe('Y')
    expect(controlLabel('west', 'gamesir')).toBe('X')
    expect(controlLabel('south', 'generic-hid')).toBe('A')
  })

  it('names shared controls and stick gestures', () => {
    expect(controlLabel('dpad_up', 'xbox')).toBe('d-pad up')
    expect(controlLabel('r3', 'dualsense')).toBe('R3')
    expect(controlLabel('rstick_right', 'dualsense')).toBe('right stick flick right')
    expect(controlLabel('lstick_ccw', 'xbox')).toBe('left stick rotate ccw')
  })
})

describe('actionLabel', () => {
  it('names simple actions', () => {
    expect(actionLabel({ type: 'accept' })).toBe('accept')
    expect(actionLabel({ type: 'push_to_talk' })).toBe('push-to-talk')
    expect(actionLabel({ type: 'new_chat' })).toBe('new chat')
    expect(actionLabel({ type: 'herdr_space' })).toBe('cycle herdr space')
  })

  it('describes parameterized actions', () => {
    expect(actionLabel({ type: 'thinking_depth', delta: 1 })).toBe('thinking depth up')
    expect(actionLabel({ type: 'thinking_depth', delta: -1 })).toBe('thinking depth down')
    expect(actionLabel({ type: 'workflow', presetId: 'debug' })).toBe('workflow "debug"')
    expect(actionLabel({ type: 'focus_session', index: -1 })).toBe('cycle session')
    expect(actionLabel({ type: 'focus_session', index: 2 })).toBe('focus session 3')
    expect(actionLabel({ type: 'layer', index: 1 })).toBe('switch to layer 2')
  })

  it('decodes keys bindings into readable key names', () => {
    expect(actionLabel({ type: 'keys', bytes: '\x1b[A' })).toBe('send up arrow')
    expect(actionLabel({ type: 'keys', bytes: '\x1b[Z' })).toBe('send shift+tab')
    expect(actionLabel({ type: 'keys', bytes: '\x15' })).toBe('send ctrl+u')
    expect(actionLabel({ type: 'keys', bytes: '\x1b[109;6u' })).toBe('send ctrl+shift+m')
    expect(actionLabel({ type: 'keys', bytes: '\x00\x01garbage' })).toBe('send keys')
  })
})
