import React from 'react'
import { DualSense, LEFT_STICK, RIGHT_STICK } from './DualSense'
import { Xbox360, XBOX_LEFT_STICK, XBOX_RIGHT_STICK } from './Xbox360'

export type Variant = 'dualsense' | 'xbox360'
export type SceneProps = { variant: Variant }

/** On-screen names for each pad's controls, keyed by the DualSense button id. */
export const LABELS = {
  dualsense: {
    cross: '✕',
    circle: '○',
    triangle: '△',
    square: '□',
    l1: 'L1',
    touchpad: 'touchpad',
    touchpadClick: 'touchpad click',
  },
  xbox360: {
    cross: 'A',
    circle: 'B',
    triangle: 'Y',
    square: 'X',
    l1: 'LB',
    touchpad: 'Guide',
    touchpadClick: 'Guide press',
  },
} as const

/** Stick centers, plus where a left-stick callout fits without covering other controls. */
export const STICKS = {
  dualsense: { left: LEFT_STICK, right: RIGHT_STICK, callout: { x: 176, y: 258 } },
  xbox360: { left: XBOX_LEFT_STICK, right: XBOX_RIGHT_STICK, callout: { x: 96, y: 246 } },
} as const

/** Renders the variant's controller; the Xbox 360 ignores lightbar and player-LED props. */
export const Pad: React.FC<React.ComponentProps<typeof DualSense> & { variant: Variant }> = ({
  variant,
  ...props
}) => (variant === 'xbox360' ? <Xbox360 {...props} /> : <DualSense {...props} />)
