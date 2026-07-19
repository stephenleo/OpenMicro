import React from 'react'
import { DIM, PANEL, TEXT } from './timeline'

/** Type-on helper: returns the visible prefix of `text` at `frame`, typing `cps` chars/frame from `start`. */
export const typeOn = (text: string, frame: number, start: number, cps = 1.2): string =>
  frame <= start ? '' : text.slice(0, Math.max(0, Math.floor((frame - start) * cps)))

export const Cursor: React.FC<{ frame: number }> = ({ frame }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 15,
      background: TEXT,
      verticalAlign: 'text-bottom',
      opacity: Math.floor(frame / 15) % 2 === 0 ? 0.9 : 0.15,
    }}
  />
)

export const Prompt: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div style={{ whiteSpace: 'pre-wrap' }}>
    <span style={{ color: '#7ee787' }}>❯ </span>
    {children}
  </div>
)

export const StatusLine: React.FC<{ children?: React.ReactNode; color?: string }> = ({
  children,
  color = DIM,
}) => <div style={{ color, fontSize: 12, marginTop: 6 }}>{children}</div>

type Props = {
  width?: number | string
  height?: number | string
  title?: string
  focused?: boolean
  focusColor?: string
  fontSize?: number
  children?: React.ReactNode
}

export const Terminal: React.FC<Props> = ({
  width = 380,
  height = 300,
  title = 'agent',
  focused = false,
  focusColor = '#4da3ff',
  fontSize = 14,
  children,
}) => (
  <div
    style={{
      width,
      height,
      background: PANEL,
      borderRadius: 12,
      border: `2px solid ${focused ? focusColor : '#2c2e38'}`,
      boxShadow: focused ? `0 0 18px ${focusColor}55` : '0 8px 24px #00000066',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"SF Mono", Menlo, Consolas, monospace',
    }}
  >
    <div
      style={{
        height: 30,
        background: '#22232b',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 7,
        flexShrink: 0,
      }}
    >
      <div style={{ width: 11, height: 11, borderRadius: 6, background: '#ff5f57' }} />
      <div style={{ width: 11, height: 11, borderRadius: 6, background: '#febc2e' }} />
      <div style={{ width: 11, height: 11, borderRadius: 6, background: '#28c840' }} />
      <div style={{ flex: 1, textAlign: 'center', color: DIM, fontSize: 12 }}>{title}</div>
      <div style={{ width: 47 }} />
    </div>
    <div
      style={{
        flex: 1,
        padding: '12px 14px',
        color: TEXT,
        fontSize,
        lineHeight: 1.55,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  </div>
)
