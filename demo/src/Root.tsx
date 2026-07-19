import React from 'react'
import { Composition } from 'remotion'
import { StatusLeds } from './scenes/StatusLeds'
import { CommandKeys } from './scenes/CommandKeys'
import { WorkflowFlick } from './scenes/WorkflowFlick'
import { ThinkingDial } from './scenes/ThinkingDial'
import { Layers } from './scenes/Layers'
import { MultiSession } from './scenes/MultiSession'

const base = { width: 800, height: 450, fps: 30 } as const

export const Root: React.FC = () => (
  <>
    <Composition id="StatusLeds" component={StatusLeds} durationInFrames={330} {...base} />
    <Composition id="CommandKeys" component={CommandKeys} durationInFrames={300} {...base} />
    <Composition id="WorkflowFlick" component={WorkflowFlick} durationInFrames={270} {...base} />
    <Composition id="ThinkingDial" component={ThinkingDial} durationInFrames={300} {...base} />
    <Composition id="Layers" component={Layers} durationInFrames={270} {...base} />
    <Composition id="MultiSession" component={MultiSession} durationInFrames={300} {...base} />
  </>
)
