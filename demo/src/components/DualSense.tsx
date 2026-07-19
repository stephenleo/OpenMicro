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
  /** Extra SVG overlays in the pad's 400x250 coordinate space. */
  children?: React.ReactNode
}

const HL_DEFAULT = '#4da3ff'

const hlColor = (v: string | boolean | undefined): string | null =>
  v ? (typeof v === 'string' ? v : HL_DEFAULT) : null

const FaceButton: React.FC<{
  cx: number
  cy: number
  hl: string | boolean | undefined
  shape: 'cross' | 'circle' | 'triangle' | 'square'
}> = ({ cx, cy, hl, shape }) => {
  const c = hlColor(hl)
  const stroke = c ?? '#9aa0ae'
  const r = 12
  return (
    <g>
      {c && <circle cx={cx} cy={cy} r={r + 5} fill={c} opacity={0.25} />}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={c ? '#2a3a52' : '#22242c'}
        stroke={c ?? '#3a3d48'}
        strokeWidth={2}
      />
      {shape === 'cross' && (
        <g stroke={stroke} strokeWidth={2.4} strokeLinecap="round">
          <line x1={cx - 4.5} y1={cy - 4.5} x2={cx + 4.5} y2={cy + 4.5} />
          <line x1={cx + 4.5} y1={cy - 4.5} x2={cx - 4.5} y2={cy + 4.5} />
        </g>
      )}
      {shape === 'circle' && (
        <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={stroke} strokeWidth={2.4} />
      )}
      {shape === 'triangle' && (
        <polygon
          points={`${cx},${cy - 6} ${cx + 5.5},${cy + 4} ${cx - 5.5},${cy + 4}`}
          fill="none"
          stroke={stroke}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      )}
      {shape === 'square' && (
        <rect
          x={cx - 5}
          y={cy - 5}
          width={10}
          height={10}
          fill="none"
          stroke={stroke}
          strokeWidth={2.4}
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
      {c && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={8} fill={c} opacity={0.3} />}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        fill={c ? '#2a3a52' : '#23252d'}
        stroke={c ?? '#3a3d48'}
        strokeWidth={1.5}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={c ?? '#9aa0ae'}
        fontFamily="ui-sans-serif, sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

const Stick: React.FC<{ cx: number; cy: number; v: Vec2 }> = ({ cx, cy, v }) => {
  const dx = v.x * 9
  const dy = v.y * 9
  return (
    <g>
      <circle cx={cx} cy={cy} r={23} fill="#16171d" stroke="#3a3d48" strokeWidth={1.5} />
      <circle cx={cx + dx} cy={cy + dy} r={16} fill="#2b2d36" stroke="#4a4d5a" strokeWidth={2} />
      <circle cx={cx + dx} cy={cy + dy} r={9} fill="none" stroke="#41434e" strokeWidth={1.5} />
    </g>
  )
}

export const DualSense: React.FC<Props> = ({
  lightbar,
  glow = 0.8,
  playerLeds = 0,
  leftStick = { x: 0, y: 0 },
  rightStick = { x: 0, y: 0 },
  highlight = {},
  width = 360,
  children,
}) => {
  const tp = hlColor(highlight.touchpad)
  const ledOn = (i: number) => (playerLeds & (1 << i)) !== 0
  return (
    <svg width={width} viewBox="0 0 400 250" style={{ display: 'block' }}>
      <defs>
        <filter id="lbglow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e3039" />
          <stop offset="1" stopColor="#1e2027" />
        </linearGradient>
      </defs>

      {/* shoulder hints (behind body) */}
      <Shoulder x={62} y={8} w={40} h={11} label="L2" hl={highlight.l2} />
      <Shoulder x={298} y={8} w={40} h={11} label="R2" hl={highlight.r2} />
      <Shoulder x={56} y={23} w={52} h={13} label="L1" hl={highlight.l1} />
      <Shoulder x={292} y={23} w={52} h={13} label="R1" hl={highlight.r1} />

      {/* body */}
      <path
        d="M 200 40
           C 160 40, 122 44, 88 54
           C 62 62, 48 80, 42 106
           L 22 172
           C 14 202, 32 226, 60 228
           C 86 230, 103 213, 113 192
           C 123 170, 140 158, 163 156
           L 237 156
           C 260 158, 277 170, 287 192
           C 297 213, 314 230, 340 228
           C 368 226, 386 202, 378 172
           L 358 106
           C 352 80, 338 62, 312 54
           C 278 44, 240 40, 200 40 Z"
        fill="url(#bodyGrad)"
        stroke="#41434e"
        strokeWidth={2}
      />

      {/* lightbar glow + strip along top */}
      <rect
        x={142}
        y={42}
        width={116}
        height={9}
        rx={4.5}
        fill={lightbar}
        filter="url(#lbglow)"
        opacity={glow}
      />
      <rect
        x={142}
        y={42}
        width={116}
        height={9}
        rx={4.5}
        fill={lightbar}
        stroke="#00000055"
        strokeWidth={1}
      />

      {/* touchpad */}
      {tp && <rect x={143} y={53} width={114} height={50} rx={13} fill={tp} opacity={0.35} />}
      <rect
        x={147}
        y={56}
        width={106}
        height={44}
        rx={11}
        fill="#25272f"
        stroke={tp ?? '#3a3d48'}
        strokeWidth={tp ? 2.5 : 1.5}
      />

      {/* player LEDs */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          {ledOn(i) && <circle cx={176 + i * 12} cy={110} r={5} fill="#dfe6ff" opacity={0.35} />}
          <circle cx={176 + i * 12} cy={110} r={2.4} fill={ledOn(i) ? '#eef2ff' : '#3a3d48'} />
        </g>
      ))}

      {/* d-pad */}
      <g fill="#22242c" stroke="#3a3d48" strokeWidth={1.5}>
        <rect x={80} y={62} width={18} height={52} rx={6} />
        <rect x={63} y={79} width={52} height={18} rx={6} />
      </g>
      <g fill="#565a68">
        <polygon points="89,70 93,77 85,77" />
        <polygon points="89,106 93,99 85,99" />
        <polygon points="71,88 78,84 78,92" />
        <polygon points="107,88 100,84 100,92" />
      </g>

      {/* face buttons */}
      <FaceButton cx={311} cy={64} hl={highlight.triangle} shape="triangle" />
      <FaceButton cx={335} cy={88} hl={highlight.circle} shape="circle" />
      <FaceButton cx={311} cy={112} hl={highlight.cross} shape="cross" />
      <FaceButton cx={287} cy={88} hl={highlight.square} shape="square" />

      {/* sticks */}
      <Stick cx={155} cy={131} v={leftStick} />
      <Stick cx={245} cy={131} v={rightStick} />

      {children}
    </svg>
  )
}
