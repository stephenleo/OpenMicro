import React from 'react'
import { useCurrentFrame } from 'remotion'
import { DualSense } from '../components/DualSense'
import { Terminal, Prompt, StatusLine, Cursor, typeOn } from '../components/Terminal'
import { SceneFrame } from '../components/SceneFrame'
import { COLORS, kf, mixColor, pulse } from '../components/timeline'

const PROMPT_TEXT = 'fix the failing auth test'

export const StatusLeds: React.FC = () => {
  const frame = useCurrentFrame()

  // Phases: idle 0-30 | executing 30-140 | complete 140-160 | ->idle 160-185
  //         waiting 190-255 | error 255-272 | ->idle 272-305 | idle to 330
  let lightbar: string = COLORS.idle
  let caption = 'idle'
  if (frame >= 30 && frame < 140) {
    const p = 0.55 + 0.45 * pulse(frame - 30, 40)
    lightbar = mixColor(COLORS.idle, COLORS.executing, p)
    caption = 'executing'
  } else if (frame >= 140 && frame < 160) {
    lightbar = COLORS.complete
    caption = 'complete'
  } else if (frame >= 160 && frame < 190) {
    lightbar = mixColor(
      COLORS.complete,
      COLORS.idle,
      kf(frame, [
        [160, 0],
        [185, 1],
      ]),
    )
    caption = 'idle'
  } else if (frame >= 190 && frame < 255) {
    const p = 0.65 + 0.35 * pulse(frame - 190, 36)
    lightbar = mixColor(COLORS.idle, COLORS.waiting, p)
    caption = 'waiting'
  } else if (frame >= 255 && frame < 272) {
    lightbar = COLORS.error
    caption = 'error'
  } else if (frame >= 272 && frame < 305) {
    lightbar = mixColor(
      COLORS.error,
      COLORS.idle,
      kf(frame, [
        [272, 0],
        [300, 1],
      ]),
    )
    caption = 'idle'
  }

  const typed = frame >= 300 ? '' : typeOn(PROMPT_TEXT, frame, 4)
  const submitted = frame >= 30 && frame < 300

  return (
    <SceneFrame
      caption={`lightbar: ${caption}`}
      pad={<DualSense lightbar={lightbar} playerLeds={0b00001} />}
      term={
        <Terminal width={368} height={310} title="claude">
          {!submitted && (
            <Prompt>
              {typed}
              <Cursor frame={frame} />
            </Prompt>
          )}
          {submitted && <Prompt>{PROMPT_TEXT}</Prompt>}
          {frame >= 32 && frame < 140 && (
            <StatusLine color="#8ab4ff">✳ Working… (esc to interrupt)</StatusLine>
          )}
          {frame >= 140 && frame < 190 && (
            <StatusLine color="#7ee787">✓ Done — 2 files changed</StatusLine>
          )}
          {frame >= 190 && frame < 255 && (
            <div
              style={{
                marginTop: 10,
                border: '1px solid #5a4a1e',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              <div style={{ color: COLORS.waiting }}>Allow Bash(npm test)?</div>
              <div style={{ color: '#8a8a96', fontSize: 12, marginTop: 4 }}>
                ❯ 1. Yes&nbsp;&nbsp;&nbsp;2. No
              </div>
            </div>
          )}
          {frame >= 255 && frame < 295 && (
            <StatusLine color="#ff6b6b">✗ Command failed (exit 1)</StatusLine>
          )}
        </Terminal>
      }
    />
  )
}
