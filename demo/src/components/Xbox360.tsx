import React from 'react'
import type { ButtonId, Vec2 } from './DualSense'

type Props = {
  /** Stick deflection, each axis -1..1 (y positive = down). */
  leftStick?: Vec2
  rightStick?: Vec2
  /** Buttons to highlight (DualSense ids: cross = A, circle = B, touchpad = Guide, …). */
  highlight?: Partial<Record<ButtonId, string | boolean>>
  width?: number
  /** Extra SVG overlays in the pad's 480x320 coordinate space. */
  children?: React.ReactNode
}

const HL_DEFAULT = '#4da3ff'
const SHELL_EDGE = '#9a9ea8'
// Classic 360 gem colors.
const FACE = {
  cross: { letter: 'A', color: '#7fb81f' },
  circle: { letter: 'B', color: '#e0301e' },
  square: { letter: 'X', color: '#1e5fd6' },
  triangle: { letter: 'Y', color: '#f5a300' },
} as const

const hlColor = (v: string | boolean | undefined): string | null =>
  v ? (typeof v === 'string' ? v : HL_DEFAULT) : null

// Stick centers in the 480x320 viewBox — exported for scene overlays.
// Proportions traced from the white wired 360: left stick high, right stick low.
export const XBOX_LEFT_STICK = { cx: 118, cy: 128 }
export const XBOX_RIGHT_STICK = { cx: 300, cy: 200 }
const DPAD = { cx: 178, cy: 202 }
const GUIDE = { cx: 240, cy: 126 }
const FACE_C = { cx: 366, cy: 128 }

const FaceButton: React.FC<{
  cx: number
  cy: number
  hl: string | boolean | undefined
  face: keyof typeof FACE
}> = ({ cx, cy, hl, face }) => {
  const c = hlColor(hl)
  const { letter, color } = FACE[face]
  const r = 13
  return (
    <g>
      {c && <circle cx={cx} cy={cy} r={r + 7} fill={c} opacity={0.5} />}
      <circle cx={cx} cy={cy} r={r + 2} fill="#d3d7dd" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        stroke={c ?? '#00000040'}
        strokeWidth={c ? 2.5 : 1}
      />
      <ellipse cx={cx - 3} cy={cy - 5} rx={7} ry={4} fill="#ffffff" opacity={0.28} />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize={14}
        fontWeight={800}
        fill="#ffffff"
        fontFamily="ui-sans-serif, sans-serif"
      >
        {letter}
      </text>
    </g>
  )
}

const Bumper: React.FC<{
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
          opacity={0.45}
        />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        fill={c ? '#dce8ff' : '#d4d6dc'}
        stroke={c ?? '#9a9ea8'}
        strokeWidth={1.4}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={c ? '#1d4fa0' : '#5c606b'}
        fontFamily="ui-sans-serif, sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

const Stick: React.FC<{ cx: number; cy: number; v: Vec2 }> = ({ cx, cy, v }) => {
  const x = cx + v.x * 9
  const y = cy + v.y * 9
  return (
    <g>
      {/* dished well molded into the shell */}
      <circle cx={cx} cy={cy} r={37} fill="url(#xWellGrad)" />
      <circle cx={cx} cy={cy} r={30} fill="#c3c7ce" />
      {/* charcoal cap with concave top and four grip dots */}
      <circle cx={x} cy={y + 2} r={26} fill="#1f2125" opacity={0.35} />
      <circle cx={x} cy={y} r={25} fill="#3a3d44" />
      <circle cx={x} cy={y} r={19} fill="#45484f" />
      <ellipse cx={x - 4} cy={y - 6} rx={11} ry={7} fill="#52555d" />
      {[
        [0, -12],
        [12, 0],
        [0, 12],
        [-12, 0],
      ].map(([dx, dy], i) => (
        <circle key={i} cx={x + dx} cy={y + dy} r={1.3} fill="#6b6f78" />
      ))}
    </g>
  )
}

/** Wired Xbox 360 Controller. The Ring of Light is drawn statically: OpenMicro has no output channel to it. */
export const Xbox360: React.FC<Props> = ({
  leftStick = { x: 0, y: 0 },
  rightStick = { x: 0, y: 0 },
  highlight = {},
  width = 380,
  children,
}) => {
  const guide = hlColor(highlight.touchpad)
  return (
    <svg width={width} viewBox="0 0 480 320" style={{ display: 'block' }}>
      <defs>
        <filter id="xPadShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#000000" floodOpacity="0.55" />
        </filter>
        <filter id="xRingGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient
          id="xShellGrad"
          x1="0"
          y1="60"
          x2="0"
          y2="300"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#f7f8fa" />
          <stop offset="0.6" stopColor="#eceef1" />
          <stop offset="1" stopColor="#d6dae0" />
        </linearGradient>
        <radialGradient id="xWellGrad" cx="0.5" cy="0.6" r="0.55">
          <stop offset="0.75" stopColor="#dfe2e7" />
          <stop offset="1" stopColor="#f3f4f6" />
        </radialGradient>
        <radialGradient id="xGuideGrad" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#f2f3f5" />
          <stop offset="1" stopColor="#a9aeb7" />
        </radialGradient>
      </defs>

      {/* gray USB cable looping up from the top edge */}
      <path
        d="M 240 66 C 240 40, 238 30, 222 24 C 200 16, 196 -2, 222 2 C 248 6, 262 -4, 268 -20"
        stroke="#9a9ca3"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
      <rect x={234} y={56} width={12} height={26} rx={3} fill="#7d8088" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={234}
          x2={246}
          y1={60 + i * 4.5}
          y2={60 + i * 4.5}
          stroke="#5f6269"
          strokeWidth={1.4}
        />
      ))}

      {/* triggers and bumpers, tucked behind the raised shoulders */}
      <Bumper x={74} y={18} w={56} h={14} label="LT" hl={highlight.l2} />
      <Bumper x={350} y={18} w={56} h={14} label="RT" hl={highlight.r2} />
      <Bumper x={62} y={37} w={84} h={15} label="LB" hl={highlight.l1} />
      <Bumper x={334} y={37} w={84} h={15} label="RB" hl={highlight.r1} />

      {/* shell silhouette: raised shoulders, dip at the cable, full rounded grips */}
      <g filter="url(#xPadShadow)">
        <path
          d="M 240 78
             C 214 78, 194 72, 172 64
             C 150 57, 118 55, 94 60
             C 68 66, 52 84, 46 112
             C 38 150, 34 200, 38 240
             C 42 272, 58 294, 84 298
             C 106 301, 122 288, 136 270
             C 152 250, 172 236, 200 229
             C 216 225, 228 224, 240 224
             C 252 224, 264 225, 280 229
             C 308 236, 328 250, 344 270
             C 358 288, 374 301, 396 298
             C 422 294, 438 272, 442 240
             C 446 200, 442 150, 434 112
             C 428 84, 412 66, 386 60
             C 362 55, 330 57, 308 64
             C 286 72, 266 78, 240 78 Z"
          fill="url(#xShellGrad)"
          stroke={SHELL_EDGE}
          strokeWidth={2}
        />
      </g>
      {/* gray underside band showing along the bottom valley */}
      <path
        d="M 132 274 C 150 252, 172 238, 200 231 C 216 227, 228 226, 240 226 C 252 226, 264 227, 280 231 C 308 238, 330 252, 348 274"
        stroke="#c7ced8"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />

      {/* Guide button inside the Ring of Light (lit by the pad itself, not by OpenMicro) */}
      {guide && <circle cx={GUIDE.cx} cy={GUIDE.cy} r={32} fill={guide} opacity={0.45} />}
      <circle cx={GUIDE.cx} cy={GUIDE.cy} r={24} fill="#e3e6ea" stroke="#c3c7ce" strokeWidth={1} />
      {[0, 1, 2, 3].map((i) => {
        const a0 = ((-90 + i * 90 + 6) * Math.PI) / 180
        const a1 = ((-90 + (i + 1) * 90 - 6) * Math.PI) / 180
        const r = 20.5
        const d = `M ${GUIDE.cx + r * Math.cos(a0)} ${GUIDE.cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${GUIDE.cx + r * Math.cos(a1)} ${GUIDE.cy + r * Math.sin(a1)}`
        return (
          <g key={i}>
            <path d={d} stroke="#9be22d" strokeWidth={5} fill="none" filter="url(#xRingGlow)" />
            <path d={d} stroke="#b8f04a" strokeWidth={3.5} fill="none" />
          </g>
        )
      })}
      <circle
        cx={GUIDE.cx}
        cy={GUIDE.cy}
        r={16.5}
        fill="url(#xGuideGrad)"
        stroke={guide ?? '#9aa0a9'}
        strokeWidth={guide ? 2.5 : 1}
      />
      <g stroke="#8d939c" strokeWidth={3.4} strokeLinecap="round">
        <path
          d={`M ${GUIDE.cx - 8} ${GUIDE.cy - 8} Q ${GUIDE.cx} ${GUIDE.cy - 2} ${GUIDE.cx + 8} ${GUIDE.cy + 8}`}
          fill="none"
        />
        <path
          d={`M ${GUIDE.cx + 8} ${GUIDE.cy - 8} Q ${GUIDE.cx} ${GUIDE.cy - 2} ${GUIDE.cx - 8} ${GUIDE.cy + 8}`}
          fill="none"
        />
      </g>
      {['1', '2', '3', '4'].map((n, i) => (
        <text
          key={n}
          x={GUIDE.cx + (i % 2 ? 22 : -22)}
          y={GUIDE.cy + (i < 2 ? -20 : 26)}
          textAnchor="middle"
          fontSize={6}
          fill="#9aa0a9"
          fontFamily="ui-sans-serif, sans-serif"
        >
          {n}
        </text>
      ))}

      {/* round Back / Start buttons flanking the Guide button */}
      {[
        { x: 202, label: 'BACK', pts: '198,126 205,122 205,130' },
        { x: 278, label: 'START', pts: '282,126 275,122 275,130' },
      ].map(({ x, label, pts }) => (
        <g key={label}>
          <circle cx={x} cy={GUIDE.cy} r={9} fill="#eef0f3" stroke="#b9bec6" strokeWidth={1.2} />
          <polygon points={pts} fill="none" stroke="#8d939c" strokeWidth={1.2} />
          <text
            x={x}
            y={GUIDE.cy - 14}
            textAnchor="middle"
            fontSize={6}
            fontWeight={700}
            fill="#a3a8b0"
            fontFamily="ui-sans-serif, sans-serif"
          >
            {label}
          </text>
        </g>
      ))}

      {/* d-pad: big gray disc with a raised cross, set in a dark ring */}
      <circle cx={DPAD.cx} cy={DPAD.cy} r={37} fill="url(#xWellGrad)" />
      <circle cx={DPAD.cx} cy={DPAD.cy} r={30} fill="#2c2e33" />
      <circle cx={DPAD.cx} cy={DPAD.cy} r={27.5} fill="#8e9299" />
      <path
        d={`M ${DPAD.cx - 7} ${DPAD.cy - 24} h 14 v 17 h 17 v 14 h -17 v 17 h -14 v -17 h -17 v -14 h 17 Z`}
        fill="#a3a7ae"
        stroke="#787c84"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <circle cx={DPAD.cx} cy={DPAD.cy} r={4} fill="#8e9299" />

      {/* face buttons */}
      <FaceButton cx={FACE_C.cx} cy={FACE_C.cy - 28} hl={highlight.triangle} face="triangle" />
      <FaceButton cx={FACE_C.cx + 28} cy={FACE_C.cy} hl={highlight.circle} face="circle" />
      <FaceButton cx={FACE_C.cx} cy={FACE_C.cy + 28} hl={highlight.cross} face="cross" />
      <FaceButton cx={FACE_C.cx - 28} cy={FACE_C.cy} hl={highlight.square} face="square" />

      {/* analog sticks */}
      <Stick cx={XBOX_LEFT_STICK.cx} cy={XBOX_LEFT_STICK.cy} v={leftStick} />
      <Stick cx={XBOX_RIGHT_STICK.cx} cy={XBOX_RIGHT_STICK.cy} v={rightStick} />

      {children}
    </svg>
  )
}
