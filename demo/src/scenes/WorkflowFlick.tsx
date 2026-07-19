import React from 'react'
import { useCurrentFrame } from 'remotion'
import { DualSense } from '../components/DualSense'
import { Terminal, Prompt, StatusLine, Cursor, typeOn } from '../components/Terminal'
import { SceneFrame } from '../components/SceneFrame'
import { COLORS, kf, mixColor, pulse } from '../components/timeline'

const WORKFLOW = 'Review this PR for correctness, security, and style issues.'

export const WorkflowFlick: React.FC = () => {
  const frame = useCurrentFrame()

  // Flick: up 20-30, snap back 30-40.
  const stickY = kf(frame, [
    [20, 0],
    [27, -1],
    [33, -1],
    [40, 0],
  ])
  const flicking = frame >= 22 && frame <= 38

  const typed = frame >= 240 ? '' : typeOn(WORKFLOW, frame, 42, 1.6)
  const submitted = frame >= 90 && frame < 240

  let lightbar: string = COLORS.idle
  if (submitted && frame < 225) {
    lightbar = mixColor(COLORS.idle, COLORS.executing, 0.55 + 0.45 * pulse(frame - 90, 40))
  } else if (frame >= 225 && frame < 245) {
    lightbar = mixColor(
      COLORS.executing,
      COLORS.idle,
      kf(frame, [
        [225, 0],
        [242, 1],
      ]),
    )
  }

  const showLabel = frame >= 24 && frame < 90

  return (
    <SceneFrame
      caption="left stick flick → workflow prompt"
      pad={
        <DualSense lightbar={lightbar} playerLeds={0b00001} leftStick={{ x: 0, y: stickY }}>
          {/* motion streak */}
          {flicking && (
            <g
              opacity={kf(frame, [
                [22, 0],
                [26, 1],
                [34, 1],
                [38, 0],
              ])}
            >
              <path
                d="M 149 128 L 152 104 M 155 126 L 155 100 M 161 128 L 158 104"
                stroke="#8ab4ff"
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.8}
              />
            </g>
          )}
          {showLabel && (
            <g>
              <rect
                x={119}
                y={166}
                width={72}
                height={18}
                rx={9}
                fill="#1c2740"
                stroke="#8ab4ff"
                strokeWidth={1}
              />
              <text
                x={155}
                y={178.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#8ab4ff"
                fontFamily="ui-sans-serif, sans-serif"
              >
                ↑ review PR
              </text>
            </g>
          )}
        </DualSense>
      }
      term={
        <Terminal width={368} height={310} title="claude">
          <Prompt>
            {typed}
            {!submitted && frame < 240 && <Cursor frame={frame} />}
            {frame >= 240 && <Cursor frame={frame} />}
          </Prompt>
          {submitted && <StatusLine color="#8ab4ff">✳ Working… (esc to interrupt)</StatusLine>}
        </Terminal>
      }
    />
  )
}
