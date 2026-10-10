import React from 'react'
import { AbsoluteFill } from 'remotion'
import { BG, DIM } from './timeline'

/** Standard layout: pad on the left, terminal (children[1]) on the right, caption below. */
export const SceneFrame: React.FC<{
  pad: React.ReactNode
  term: React.ReactNode
  caption?: string
}> = ({ pad, term, caption }) => (
  <AbsoluteFill
    style={{
      background: BG,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      padding: 24,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {pad}
      {/* fixed-height line so the pad doesn't jump when a caption appears or clears */}
      <div
        style={{
          color: DIM,
          fontFamily: 'ui-sans-serif, sans-serif',
          fontSize: 14,
          fontWeight: 600,
          height: 20,
          lineHeight: '20px',
          whiteSpace: 'pre',
        }}
      >
        {caption}
      </div>
    </div>
    {term}
  </AbsoluteFill>
)
