import React from 'react'
import { Composition } from 'remotion'
import { StatusLeds } from './scenes/StatusLeds'
import { CommandKeys } from './scenes/CommandKeys'
import { WorkflowFlick } from './scenes/WorkflowFlick'
import { ThinkingDial } from './scenes/ThinkingDial'
import { Layers } from './scenes/Layers'
import { MultiSession } from './scenes/MultiSession'

const base = { width: 800, height: 450, fps: 30 } as const
const ds = { variant: 'dualsense' } as const
// No StatusLeds for the 360: OpenMicro cannot drive its Ring of Light.
const x360 = { variant: 'xbox360' } as const

export const Root: React.FC = () => (
  <>
    <Composition id="StatusLeds" component={StatusLeds} durationInFrames={330} {...base} />
    <Composition
      id="CommandKeys"
      component={CommandKeys}
      durationInFrames={300}
      defaultProps={ds}
      {...base}
    />
    <Composition
      id="WorkflowFlick"
      component={WorkflowFlick}
      durationInFrames={270}
      defaultProps={ds}
      {...base}
    />
    <Composition
      id="ThinkingDial"
      component={ThinkingDial}
      durationInFrames={300}
      defaultProps={ds}
      {...base}
    />
    <Composition
      id="Layers"
      component={Layers}
      durationInFrames={270}
      defaultProps={ds}
      {...base}
    />
    <Composition
      id="MultiSession"
      component={MultiSession}
      durationInFrames={300}
      defaultProps={ds}
      {...base}
    />
    <Composition
      id="Xbox360CommandKeys"
      component={CommandKeys}
      durationInFrames={300}
      defaultProps={x360}
      {...base}
    />
    <Composition
      id="Xbox360WorkflowFlick"
      component={WorkflowFlick}
      durationInFrames={270}
      defaultProps={x360}
      {...base}
    />
    <Composition
      id="Xbox360ThinkingDial"
      component={ThinkingDial}
      durationInFrames={300}
      defaultProps={x360}
      {...base}
    />
    <Composition
      id="Xbox360Layers"
      component={Layers}
      durationInFrames={270}
      defaultProps={x360}
      {...base}
    />
    <Composition
      id="Xbox360MultiSession"
      component={MultiSession}
      durationInFrames={300}
      defaultProps={x360}
      {...base}
    />
  </>
)
