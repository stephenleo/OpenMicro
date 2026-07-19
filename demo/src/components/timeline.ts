import { interpolate } from 'remotion'

// Must match src/feedback.ts STATE_COLOR exactly.
export const COLORS = {
  executing: 'rgb(0,0,255)',
  waiting: 'rgb(255,176,0)',
  idle: 'rgb(20,20,20)',
  complete: 'rgb(0,255,0)',
  error: 'rgb(255,0,0)',
  layer2: 'rgb(160,32,240)',
} as const

export const BG = '#101014'
export const PANEL = '#1a1a22'
export const TEXT = '#e8e8ec'
export const DIM = '#8a8a96'

/** Piecewise-linear keyframe helper: value at `frame` given [frame, value] pairs. */
export const kf = (frame: number, pairs: [number, number][]): number => {
  const frames = pairs.map((p) => p[0])
  const values = pairs.map((p) => p[1])
  return interpolate(frame, frames, values, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** Returns the last segment value whose start frame <= frame (step function for discrete states). */
export const step = <T>(frame: number, segments: [number, T][]): T => {
  let out = segments[0][1]
  for (const [f, v] of segments) {
    if (frame >= f) out = v
  }
  return out
}

/** Blend between two rgb() strings, t in [0,1]. */
export const mixColor = (a: string, b: string, t: number): string => {
  const parse = (s: string): number[] => s.match(/\d+/g)!.map(Number)
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`
}

/** 0..1 pulse (sine) with given period in frames. */
export const pulse = (frame: number, period: number): number =>
  0.5 + 0.5 * Math.sin((frame / period) * Math.PI * 2)
