import React from 'react'
import { useCurrentFrame } from 'remotion'
import { DualSense, RIGHT_STICK } from '../components/DualSense'
import { Terminal, Prompt, StatusLine } from '../components/Terminal'
import { SceneFrame } from '../components/SceneFrame'
import { COLORS, DIM, kf } from '../components/timeline'

const LEVELS = ['low', 'medium', 'high', 'xhigh']

/** Stick cap angle in degrees (0 = up, clockwise positive) over the scene. One quarter-turn = one effort step. */
const angleAt = (frame: number): number =>
  kf(frame, [
    [30, 0],
    [52, 90], // clockwise quarter-turn
    [155, 90],
    [177, 0], // counter-clockwise quarter-turn back
  ])

export const ThinkingDial: React.FC = () => {
  const frame = useCurrentFrame()
  const deg = angleAt(frame)
  const rad = ((deg - 90) * Math.PI) / 180
  const mag = kf(frame, [
    [26, 0],
    [31, 1],
    [56, 1],
    [63, 0],
    [148, 0],
    [153, 1],
    [180, 1],
    [187, 0],
  ])
  const turning = mag > 0.5
  const stick = { x: mag * Math.cos(rad), y: mag * Math.sin(rad) }

  // effort level: high -> xhigh at 50, back to high at 175
  const level = frame >= 50 && frame < 175 ? 'xhigh' : 'high'
  const showSlash = frame >= 20

  // arc trace just outside the right stick well
  const arcSweep = deg
  const arcPath = (endDeg: number): string => {
    const r = 39
    const { cx, cy } = RIGHT_STICK
    const clamped = Math.max(-359.9, Math.min(359.9, endDeg))
    const a0 = -90
    const a1 = -90 + clamped
    const x1 = cx + r * Math.cos((a0 * Math.PI) / 180)
    const y1 = cy + r * Math.sin((a0 * Math.PI) / 180)
    const x2 = cx + r * Math.cos((a1 * Math.PI) / 180)
    const y2 = cy + r * Math.sin((a1 * Math.PI) / 180)
    const large = Math.abs(clamped) > 180 ? 1 : 0
    const sweep = clamped >= 0 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`
  }

  return (
    <SceneFrame
      caption="right stick dial → thinking effort"
      pad={
        <DualSense lightbar={COLORS.idle} playerLeds={0b00001} rightStick={stick}>
          {turning && arcSweep > 2 && (
            <path
              d={arcPath(arcSweep)}
              fill="none"
              stroke="#a020f0"
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.9}
            />
          )}
        </DualSense>
      }
      term={
        <Terminal width={368} height={310} title="codex">
          <Prompt>/effort</Prompt>
          {showSlash && (
            <div style={{ marginTop: 10 }}>
              <StatusLine>Model reasoning effort</StatusLine>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {LEVELS.map((l) => (
                  <div
                    key={l}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 13,
                      border: `1px solid ${l === level ? '#c792ea' : '#33353f'}`,
                      color: l === level ? '#e6d5f7' : DIM,
                      background: l === level ? '#3a2a52' : 'transparent',
                    }}
                  >
                    {l}
                  </div>
                ))}
              </div>
              <StatusLine>
                {level === 'xhigh' ? '↑ effort set to xhigh' : 'effort: high'}
              </StatusLine>
            </div>
          )}
        </Terminal>
      }
    />
  )
}
