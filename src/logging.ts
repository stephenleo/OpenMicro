import type { Action, AgentState } from './harness/types.js'
import { actionLabel, controlLabel } from './labels.js'
import type { ControlId } from './layers.js'
import type { ControllerEvent, ControllerType } from './types.js'

export type GuiStatusTone = 'success' | 'warning' | 'action' | AgentState

export interface GuiStatus {
  message: string
  tone: GuiStatusTone
}

export interface AgentStatus extends GuiStatus {
  stateKey: string
}

/** Format a controller lifecycle event for a GUI consumer. */
export function controllerStatus(event: ControllerEvent): GuiStatus | null {
  if (event.kind === 'connected') {
    return {
      message: `controller connected (${event.controllerType}) — buttons now drive the app`,
      tone: 'success',
    }
  }
  if (event.kind === 'disconnected') {
    return { message: 'controller disconnected — waiting…', tone: 'warning' }
  }
  return null
}

/** Format a successfully routed controller action without exposing its payload. */
export function actionStatus(
  control: ControlId | null,
  controllerType: ControllerType,
  action: Action,
): GuiStatus | null {
  if (!control) return null
  return {
    message: `${controlLabel(control, controllerType)} → ${actionLabel(action)}`,
    tone: 'action',
  }
}

/** Format a changed GUI agent-state snapshot. */
export function agentStatus(
  states: readonly AgentState[],
  previousStateKey = '',
): AgentStatus | null {
  const stateKey = states.join(', ')
  if (!stateKey || stateKey === previousStateKey) return null
  return {
    message: `agent: ${stateKey}`,
    tone: states[0] ?? 'idle',
    stateKey,
  }
}
