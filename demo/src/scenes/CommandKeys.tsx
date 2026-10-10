import React from 'react'
import { useCurrentFrame } from 'remotion'
import { ButtonId } from '../components/DualSense'
import { LABELS, Pad, SceneProps } from '../components/Pad'
import { Terminal, Prompt, StatusLine, Cursor } from '../components/Terminal'
import { SceneFrame } from '../components/SceneFrame'
import { COLORS, mixColor, pulse } from '../components/timeline'

const SEG = 75 // frames per button segment

const ACTIONS: { btn: 'cross' | 'circle' | 'triangle' | 'square'; label: string }[] = [
  { btn: 'cross', label: 'Submit ⏎' },
  { btn: 'circle', label: 'Esc / interrupt' },
  { btn: 'triangle', label: 'Push-to-talk' },
  { btn: 'square', label: 'New chat' },
]

export const CommandKeys: React.FC<SceneProps> = ({ variant }) => {
  const frame = useCurrentFrame()
  const seg = Math.min(3, Math.floor(frame / SEG))
  const lf = frame - seg * SEG
  const pressed = lf >= 15 && lf < 55
  const { btn, label } = ACTIONS[seg]
  const glyph = LABELS[variant][btn]
  const highlight: Partial<Record<ButtonId, boolean>> = pressed ? { [btn]: true } : {}

  const lightbar =
    seg === 0 && pressed
      ? mixColor(COLORS.idle, COLORS.executing, 0.6 + 0.4 * pulse(lf, 30))
      : COLORS.idle

  return (
    <SceneFrame
      caption={pressed ? `${glyph}  ${label}` : ' '}
      pad={<Pad variant={variant} lightbar={lightbar} playerLeds={0b00001} highlight={highlight} />}
      term={
        <Terminal width={368} height={310} title="claude">
          {/* segment 0: submit */}
          {seg === 0 && (
            <>
              <Prompt>
                explain this function
                {!pressed && lf < 15 && <Cursor frame={frame} />}
              </Prompt>
              {lf >= 20 && <StatusLine color="#8ab4ff">✳ Working… (esc to interrupt)</StatusLine>}
            </>
          )}
          {/* segment 1: interrupt */}
          {seg === 1 && (
            <>
              <Prompt>explain this function</Prompt>
              {lf < 20 && <StatusLine color="#8ab4ff">✳ Working… (esc to interrupt)</StatusLine>}
              {lf >= 20 && <StatusLine color={COLORS.waiting}>⏹ Interrupted</StatusLine>}
            </>
          )}
          {/* segment 2: dictation */}
          {seg === 2 && (
            <>
              <Prompt>
                <Cursor frame={frame} />
              </Prompt>
              {lf >= 20 && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: '#ff5f57',
                      opacity: 0.5 + 0.5 * pulse(lf, 20),
                    }}
                  />
                  <span style={{ color: '#c8c8d0', fontSize: 13 }}>
                    Listening… release {LABELS[variant].triangle} to stop
                  </span>
                </div>
              )}
            </>
          )}
          {/* segment 3: new chat */}
          {seg === 3 && (
            <>
              {lf < 20 && <Prompt>explain this function</Prompt>}
              {lf >= 20 && (
                <>
                  <StatusLine>── New chat ──</StatusLine>
                  <Prompt>
                    <Cursor frame={frame} />
                  </Prompt>
                </>
              )}
            </>
          )}
        </Terminal>
      }
    />
  )
}
