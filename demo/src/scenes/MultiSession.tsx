import React from 'react'
import { useCurrentFrame } from 'remotion'
import { DualSense } from '../components/DualSense'
import { Terminal, Prompt, StatusLine } from '../components/Terminal'
import { SceneFrame } from '../components/SceneFrame'
import { COLORS, mixColor, pulse } from '../components/timeline'

export const MultiSession: React.FC = () => {
  const frame = useCurrentFrame()

  // Timeline: pane1 focused/executing 0-90 | touchpad click 60-85 | focus->pane2 at 85,
  // lightbar amber | ✕ 130-155 -> pane2 approves, executing blue | touchpad click 235-255
  // -> focus back to pane1, pane2 back to waiting (new permission) => loop.
  const focus2 = frame >= 85 && frame < 250
  const touchpadClick = (frame >= 60 && frame < 85) || (frame >= 228 && frame < 250)
  const crossPressed = frame >= 130 && frame < 155
  const pane2Executing = frame >= 145 && frame < 215
  const pane2Waiting = !pane2Executing

  let lightbar: string
  if (!focus2) {
    lightbar = mixColor(COLORS.idle, COLORS.executing, 0.55 + 0.45 * pulse(frame, 40))
  } else if (pane2Executing) {
    lightbar = mixColor(COLORS.idle, COLORS.executing, 0.55 + 0.45 * pulse(frame - 145, 40))
  } else {
    lightbar = mixColor(COLORS.idle, COLORS.waiting, 0.7 + 0.3 * pulse(frame - 85, 36))
  }

  const pane = (n: 1 | 2, focused: boolean, body: React.ReactNode) => (
    <Terminal
      width={368}
      height={150}
      fontSize={12}
      title={`session ${n}`}
      focused={focused}
      focusColor={n === 2 && pane2Waiting ? COLORS.waiting : '#4da3ff'}
    >
      {body}
    </Terminal>
  )

  return (
    <SceneFrame
      caption={
        touchpadClick
          ? 'touchpad click → cycle focus'
          : focus2
            ? 'focus: session 2'
            : 'focus: session 1'
      }
      pad={
        <DualSense
          lightbar={lightbar}
          playerLeds={0b00011}
          highlight={{ touchpad: touchpadClick ? '#4da3ff' : false, cross: crossPressed }}
        />
      }
      term={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pane(
            1,
            !focus2,
            <>
              <Prompt>write tests for parser.ts</Prompt>
              <StatusLine color="#8ab4ff">✳ Working… (esc to interrupt)</StatusLine>
            </>,
          )}
          {pane(
            2,
            focus2,
            <>
              <Prompt>refactor auth module</Prompt>
              {pane2Waiting && (
                <StatusLine color={COLORS.waiting}>
                  ⚠ Allow Edit(auth.ts)? — press ✕ to approve
                </StatusLine>
              )}
              {!pane2Waiting && (
                <StatusLine color="#8ab4ff">✳ Working… (esc to interrupt)</StatusLine>
              )}
            </>,
          )}
        </div>
      }
    />
  )
}
