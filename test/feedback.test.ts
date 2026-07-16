import { describe, expect, it } from 'vitest'
import { feedbackFor } from '../src/feedback.js'
import type { SessionSnapshot } from '../src/feedback.js'

const LAYER_COLOR = { r: 10, g: 20, b: 30 }

describe('feedbackFor', () => {
  it('maps the focused session state to the matching lightbar color', () => {
    const sessions: SessionSnapshot[] = [{ state: 'executing' }, { state: 'error' }]
    expect(feedbackFor(sessions, 0, LAYER_COLOR).lightbar).toEqual({ r: 0, g: 0, b: 255 })
    expect(feedbackFor(sessions, 1, LAYER_COLOR).lightbar).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('covers all state colors', () => {
    expect(feedbackFor([{ state: 'waiting' }], 0, LAYER_COLOR).lightbar).toEqual({
      r: 255,
      g: 176,
      b: 0,
    })
    expect(feedbackFor([{ state: 'idle' }], 0, LAYER_COLOR).lightbar).toEqual({
      r: 20,
      g: 20,
      b: 20,
    })
    expect(feedbackFor([{ state: 'complete' }], 0, LAYER_COLOR).lightbar).toEqual({
      r: 0,
      g: 255,
      b: 0,
    })
  })

  it('falls back to the layer color when there is no focused session', () => {
    expect(feedbackFor([], 0, LAYER_COLOR).lightbar).toEqual(LAYER_COLOR)
    expect(feedbackFor([{ state: 'idle' }], 5, LAYER_COLOR).lightbar).toEqual(LAYER_COLOR)
  })

  it('sets one player LED bit per occupied slot, in order', () => {
    const sessions: SessionSnapshot[] = [{ state: 'idle' }, { state: 'idle' }, { state: 'idle' }]
    expect(feedbackFor(sessions, 0, LAYER_COLOR).playerLeds).toBe(0b00000111)
  })

  it('caps player LEDs at 5 slots', () => {
    const sessions: SessionSnapshot[] = Array.from(
      { length: 8 },
      () => ({ state: 'idle' }) as const,
    )
    expect(feedbackFor(sessions, 0, LAYER_COLOR).playerLeds).toBe(0b00011111)
  })

  it('returns no LEDs for an empty session list', () => {
    expect(feedbackFor([], 0, LAYER_COLOR).playerLeds).toBe(0)
  })
})
