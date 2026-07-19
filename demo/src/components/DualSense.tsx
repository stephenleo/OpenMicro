import React from 'react'

export type Vec2 = { x: number; y: number }
export type ButtonId =
  'cross' | 'circle' | 'triangle' | 'square' | 'l1' | 'r1' | 'l2' | 'r2' | 'touchpad'

type Props = {
  /** Lightbar color, any CSS color. */
  lightbar: string
  /** Glow intensity 0..1. */
  glow?: number
  /** Bitmask of lit player LEDs (bit 0 = leftmost). */
  playerLeds?: number
  /** Stick deflection, each axis -1..1 (y positive = down). */
  leftStick?: Vec2
  rightStick?: Vec2
  /** Buttons to highlight, mapped to highlight color (or true for default). */
  highlight?: Partial<Record<ButtonId, string | boolean>>
  width?: number
  /** Extra SVG overlays in the pad's 480x320 coordinate space. */
  children?: React.ReactNode
}

const HL_DEFAULT = '#4da3ff'
const SHELL_EDGE = '#41434e'
const GLYPH = { triangle: '#35a15b', circle: '#d6605e', cross: '#7387d6', square: '#cf87b6' }

const hlColor = (v: string | boolean | undefined): string | null =>
  v ? (typeof v === 'string' ? v : HL_DEFAULT) : null

// Stick centers in the 480x320 viewBox — exported for scene overlays.
export const LEFT_STICK = { cx: 176, cy: 185 }
export const RIGHT_STICK = { cx: 304, cy: 185 }

const FaceButton: React.FC<{
  cx: number
  cy: number
  hl: string | boolean | undefined
  shape: keyof typeof GLYPH
}> = ({ cx, cy, hl, shape }) => {
  const c = hlColor(hl)
  const glyph = GLYPH[shape]
  const r = 13.5
  return (
    <g>
      {c && <circle cx={cx} cy={cy} r={r + 6} fill={c} opacity={0.4} />}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={c ? '#2a3a52' : '#22242c'}
        stroke={c ?? '#3a3d48'}
        strokeWidth={c ? 2.5 : 1.6}
      />
      {shape === 'cross' && (
        <g stroke={glyph} strokeWidth={2.6} strokeLinecap="round">
          <line x1={cx - 4.8} y1={cy - 4.8} x2={cx + 4.8} y2={cy + 4.8} />
          <line x1={cx + 4.8} y1={cy - 4.8} x2={cx - 4.8} y2={cy + 4.8} />
        </g>
      )}
      {shape === 'circle' && (
        <circle cx={cx} cy={cy} r={5.8} fill="none" stroke={glyph} strokeWidth={2.6} />
      )}
      {shape === 'triangle' && (
        <polygon
          points={`${cx},${cy - 6.2} ${cx + 5.8},${cy + 4.4} ${cx - 5.8},${cy + 4.4}`}
          fill="none"
          stroke={glyph}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      )}
      {shape === 'square' && (
        <rect
          x={cx - 5.2}
          y={cy - 5.2}
          width={10.4}
          height={10.4}
          fill="none"
          stroke={glyph}
          strokeWidth={2.5}
          rx={1.5}
        />
      )}
    </g>
  )
}

const Shoulder: React.FC<{
  x: number
  y: number
  w: number
  h: number
  label: string
  hl?: string | boolean
}> = ({ x, y, w, h, label, hl }) => {
  const c = hlColor(hl)
  return (
    <g>
      {c && (
        <rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx={(h + 6) / 2}
          fill={c}
          opacity={0.35}
        />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        fill={c ? '#2a3a52' : '#23252d'}
        stroke={c ?? '#3a3d48'}
        strokeWidth={1.4}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={c ? '#cfe0ff' : '#9aa0ae'}
        fontFamily="ui-sans-serif, sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

const Stick: React.FC<{ cx: number; cy: number; v: Vec2 }> = ({ cx, cy, v }) => {
  const dx = v.x * 10
  const dy = v.y * 10
  return (
    <g>
      {/* recessed well */}
      <circle cx={cx} cy={cy} r={31} fill="#191a20" />
      <circle cx={cx} cy={cy} r={28.5} fill="#101116" />
      {/* dark cap with textured rim */}
      <circle cx={cx + dx} cy={cy + dy} r={22} fill="#2b2d36" />
      <circle
        cx={cx + dx}
        cy={cy + dy}
        r={19.5}
        fill="none"
        stroke="#4a4d5a"
        strokeWidth={2.4}
        strokeDasharray="2.2 2.6"
      />
      {/* concave top */}
      <circle cx={cx + dx} cy={cy + dy} r={14} fill="#35373f" />
      <ellipse cx={cx + dx - 3} cy={cy + dy - 4} rx={8} ry={5.5} fill="#3d404a" />
    </g>
  )
}

export const DualSense: React.FC<Props> = ({
  lightbar,
  glow = 0.85,
  playerLeds = 0,
  leftStick = { x: 0, y: 0 },
  rightStick = { x: 0, y: 0 },
  highlight = {},
  width = 380,
  children,
}) => {
  const tp = hlColor(highlight.touchpad)
  const ledOn = (i: number) => (playerLeds & (1 << i)) !== 0
  return (
    <svg width={width} viewBox="0 0 480 320" style={{ display: 'block' }}>
      <defs>
        <filter id="lbglow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="padShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#000000" floodOpacity="0.55" />
        </filter>
        <linearGradient
          id="shellGrad"
          x1="0"
          y1="40"
          x2="0"
          y2="310"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2e3039" />
          <stop offset="0.55" stopColor="#262830" />
          <stop offset="1" stopColor="#1e2027" />
        </linearGradient>
        <radialGradient id="tpGrad" cx="0.5" cy="0.3" r="1">
          <stop offset="0" stopColor="#292b33" />
          <stop offset="1" stopColor="#22242b" />
        </radialGradient>
      </defs>

      {/* shoulder hints, tucked behind the top edge */}
      <Shoulder x={70} y={8} w={44} h={12} label="L2" hl={highlight.l2} />
      <Shoulder x={366} y={8} w={44} h={12} label="R2" hl={highlight.r2} />
      <Shoulder x={64} y={25} w={54} h={14} label="L1" hl={highlight.l1} />
      <Shoulder x={362} y={25} w={54} h={14} label="R1" hl={highlight.r1} />

      {/* shell silhouette: one closed path — hump over the touchpad, sloped shoulders,
          near-parallel grips with rounded bulbs, deep U valley between them */}
      <g filter="url(#padShadow)">
        <path
          d="M 240 52
             C 206 52, 174 55, 150 60
             C 122 66, 102 74, 92 84
             C 76 96, 66 110, 61 132
             C 57 158, 55 185, 53 210
             C 50 238, 52 264, 60 283
             C 68 300, 82 308, 96 306
             C 110 304, 122 296, 131 284
             C 140 271, 150 259, 162 250
             C 184 234, 214 218, 240 218
             C 266 218, 296 234, 318 250
             C 330 259, 340 271, 349 284
             C 358 296, 370 304, 384 306
             C 398 308, 412 300, 420 283
             C 428 264, 430 238, 427 210
             C 425 185, 423 158, 420 132
             C 414 110, 404 96, 388 84
             C 378 74, 358 66, 330 60
             C 306 55, 274 52, 240 52 Z"
          fill="url(#shellGrad)"
          stroke={SHELL_EDGE}
          strokeWidth={2}
        />
      </g>

      {/* lightbar: single horizontal strip along the top of the shell */}
      <rect
        x={168}
        y={59}
        width={144}
        height={9}
        rx={4.5}
        fill={lightbar}
        filter="url(#lbglow)"
        opacity={glow}
      />
      <rect
        x={168}
        y={59}
        width={144}
        height={9}
        rx={4.5}
        fill={lightbar}
        stroke="#00000055"
        strokeWidth={1}
      />

      {/* touchpad below the lightbar */}
      {tp && <rect x={164} y={66} width={152} height={64} rx={18} fill={tp} opacity={0.4} />}
      <rect
        x={170}
        y={72}
        width={140}
        height={52}
        rx={14}
        fill="url(#tpGrad)"
        stroke={tp ?? '#3a3d48'}
        strokeWidth={tp ? 2.5 : 1.4}
      />

      {/* create / options buttons flanking the touchpad top corners */}
      <rect
        x={148}
        y={68}
        width={7}
        height={20}
        rx={3.5}
        fill="#2a2c34"
        stroke="#3a3d48"
        strokeWidth={1}
        transform="rotate(-22 151.5 78)"
      />
      <rect
        x={325}
        y={68}
        width={7}
        height={20}
        rx={3.5}
        fill="#2a2c34"
        stroke="#3a3d48"
        strokeWidth={1}
        transform="rotate(22 328.5 78)"
      />

      {/* player LEDs directly below the touchpad */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          {ledOn(i) && <circle cx={216 + i * 12} cy={134} r={5.5} fill="#dfe6ff" opacity={0.35} />}
          <circle cx={216 + i * 12} cy={134} r={2.5} fill={ledOn(i) ? '#eef2ff' : '#3a3d48'} />
        </g>
      ))}

      {/* d-pad: four standalone buttons in a cross with a center gap */}
      <g fill="#22242c" stroke="#3a3d48" strokeWidth={1.6}>
        <rect x={119} y={84} width={22} height={21} rx={7} />
        <rect x={119} y={123} width={22} height={21} rx={7} />
        <rect x={100} y={103} width={21} height={22} rx={7} />
        <rect x={139} y={103} width={21} height={22} rx={7} />
      </g>
      <g fill="#7b7f8c">
        <polygon points="130,90 135,98 125,98" />
        <polygon points="130,138 135,130 125,130" />
        <polygon points="106,114 114,109 114,119" />
        <polygon points="154,114 146,109 146,119" />
      </g>

      {/* face buttons */}
      <FaceButton cx={350} cy={90} hl={highlight.triangle} shape="triangle" />
      <FaceButton cx={377} cy={118} hl={highlight.circle} shape="circle" />
      <FaceButton cx={350} cy={146} hl={highlight.cross} shape="cross" />
      <FaceButton cx={323} cy={118} hl={highlight.square} shape="square" />

      {/* mic bar between the sticks */}
      <rect
        x={223}
        y={188}
        width={34}
        height={7}
        rx={3.5}
        fill="#2a2c34"
        stroke="#3a3d48"
        strokeWidth={1}
      />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={231 + i * 6} cy={191.5} r={1.2} fill="#6b6f7c" />
      ))}

      {/* analog sticks */}
      <Stick cx={LEFT_STICK.cx} cy={LEFT_STICK.cy} v={leftStick} />
      <Stick cx={RIGHT_STICK.cx} cy={RIGHT_STICK.cy} v={rightStick} />

      {children}
    </svg>
  )
}
