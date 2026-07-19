import React from 'react'
import { useCurrentFrame } from 'remotion'
import { DualSense } from '../components/DualSense'
import { Terminal, StatusLine } from '../components/Terminal'
import { SceneFrame } from '../components/SceneFrame'
import { COLORS, DIM, TEXT, kf, mixColor, pulse } from '../components/timeline'

export const Layers: React.FC = () => {
  const frame = useCurrentFrame()

  const l1Held = frame >= 30 && frame < 90
  const circlePressed = frame >= 60 && frame < 85
  const onLayer2 = frame >= 72 && frame < 210

  let lightbar: string = COLORS.idle
  if (frame >= 72 && frame < 100) {
    // violet flash
    lightbar = mixColor(
      COLORS.idle,
      COLORS.layer2,
      kf(frame, [
        [72, 0],
        [78, 1],
      ]),
    )
  } else if (frame >= 100 && frame < 210) {
    lightbar = mixColor(COLORS.idle, COLORS.layer2, 0.75 + 0.25 * pulse(frame - 100, 50))
  } else if (frame >= 210 && frame < 240) {
    lightbar = mixColor(
      COLORS.layer2,
      COLORS.idle,
      kf(frame, [
        [210, 0],
        [232, 1],
      ]),
    )
  }

  const layerName = onLayer2 ? 'Layer 2' : 'Layer 1'

  return (
    <SceneFrame
      caption={l1Held ? 'hold L1 + ○ → switch layer' : `current: ${layerName}`}
      pad={
        <DualSense
          lightbar={lightbar}
          playerLeds={0b00001}
          highlight={{
            l1: l1Held ? '#c792ea' : false,
            circle: circlePressed ? '#c792ea' : false,
          }}
        />
      }
      term={
        <Terminal width={368} height={310} title="openmicro">
          <div
            style={{
              display: 'inline-block',
              padding: '5px 14px',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              color: onLayer2 ? '#fff' : TEXT,
              background: onLayer2 ? COLORS.layer2 : '#2c2e38',
              transition: 'none',
            }}
          >
            {layerName}
          </div>
          {!onLayer2 && (
            <div style={{ marginTop: 14, fontSize: 13, color: DIM, lineHeight: 1.9 }}>
              <div>✕ accept&nbsp;&nbsp;○ reject&nbsp;&nbsp;△ talk&nbsp;&nbsp;□ new chat</div>
              <div style={{ marginTop: 6 }}>hold L1 + ○ ⇒ Layer 2</div>
            </div>
          )}
          {onLayer2 && (
            <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.9 }}>
              <StatusLine color="#c792ea">⬢ custom bindings active</StatusLine>
              <div style={{ marginTop: 6, color: TEXT }}>
                ✕ → <span style={{ color: '#c792ea' }}>/compact</span>
              </div>
              <div style={{ color: TEXT }}>
                □ → <span style={{ color: '#c792ea' }}>/model</span>
              </div>
              <div style={{ marginTop: 10, color: DIM, fontSize: 12 }}>
                hold L1 + ✕ ⇒ back to Layer 1
              </div>
            </div>
          )}
        </Terminal>
      }
    />
  )
}
