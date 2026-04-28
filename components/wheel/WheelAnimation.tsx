'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  games: string[]
  target: string
  onComplete: () => void
}

const COLORS = [
  '#7c3aed', // violet-700  (brand)
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#2563eb', // blue-600
  '#dc2626', // red-600
  '#0891b2', // cyan-600
  '#9333ea', // purple-600
  '#16a34a', // green-600
  '#ea580c', // orange-600
  '#0284c7', // sky-600
]

const NUM_SPINS = 8    // more rotations = more exciting
const DURATION   = 4000 // ms — longer allows a dramatic slow stop
const SIZE = 340

// Quintic ease-out: fast start, very gradual stop
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5)
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function drawWheel(canvas: HTMLCanvasElement, games: string[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx || games.length === 0) return

  // HiDPI scaling for sharp rendering on retina screens
  const dpr = window.devicePixelRatio || 1
  canvas.width = SIZE * dpr
  canvas.height = SIZE * dpr
  canvas.style.width = `${SIZE}px`
  canvas.style.height = `${SIZE}px`
  ctx.scale(dpr, dpr)

  const cx = SIZE / 2
  const cy = SIZE / 2
  const radius = SIZE / 2 - 3
  const n = games.length
  const seg = (2 * Math.PI) / n
  const fontSize = n <= 6 ? 14 : n <= 10 ? 12 : 10

  ctx.clearRect(0, 0, SIZE, SIZE)

  for (let i = 0; i < n; i++) {
    const start = i * seg
    const end = (i + 1) * seg
    const mid = start + seg / 2

    // Filled segment
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, start, end)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.fill()

    // White divider lines between segments
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, start, end)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Segment label — drawn radially from centre outward
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(mid)
    ctx.translate(radius * 0.6, 0)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 3
    ctx.fillText(truncate(games[i], 16), 0, 0)
    ctx.shadowBlur = 0
    ctx.restore()
  }

  // Outer ring
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 4
  ctx.stroke()

  // Centre hub
  ctx.beginPath()
  ctx.arc(cx, cy, 16, 0, 2 * Math.PI)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#d4d4d8'
  ctx.lineWidth = 2
  ctx.stroke()

  // Hub dot
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, 2 * Math.PI)
  ctx.fillStyle = '#a1a1aa'
  ctx.fill()
}

export default function WheelAnimation({ games, target, onComplete }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rafRef     = useRef<number | null>(null)
  const [label, setLabel] = useState('')

  // Redraw the wheel whenever the game list changes
  useEffect(() => {
    if (canvasRef.current) drawWheel(canvasRef.current, games)
  }, [games])

  // Single smooth rAF animation — no phase boundaries, no velocity jerk
  useEffect(() => {
    if (!wrapperRef.current || !target || games.length === 0) return

    const wrapper = wrapperRef.current
    const n = games.length
    const segDeg = 360 / n
    const winnerIndex = games.indexOf(target)
    if (winnerIndex === -1) return

    // Clockwise rotation so the winner segment lands at the pointer (right / 0°)
    const winnerOffset = (winnerIndex + 0.5) * segDeg
    const totalRotation = NUM_SPINS * 360 - winnerOffset

    setLabel('')
    wrapper.style.transform = 'rotate(0deg)'

    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const t = Math.min(elapsed / DURATION, 1)
      const angle = totalRotation * easeOutQuint(t)
      wrapper.style.transform = `rotate(${angle}deg)`

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        wrapper.style.transform = `rotate(${totalRotation}deg)`
        setLabel(target)
        onComplete()
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [games, target, onComplete])

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Wheel + fixed pointer */}
      <div className="relative" style={{ width: SIZE + 28, height: SIZE }}>

        {/* Rotating canvas */}
        <div
          ref={wrapperRef}
          className="absolute top-0 left-0"
          style={{ width: SIZE, height: SIZE }}
        >
          <canvas ref={canvasRef} className="block" />
        </div>

        {/* Fixed pointer — left-pointing triangle at 3 o'clock */}
        <div
          className="absolute"
          style={{
            left: SIZE - 6,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '11px solid transparent',
            borderBottom: '11px solid transparent',
            borderRight: '20px solid #7c3aed',
            filter: 'drop-shadow(-2px 0 3px rgba(0,0,0,0.3))',
          }}
        />
      </div>

      {label && (
        <p className="text-sm text-brand-600 font-semibold animate-pulse">
          🎯 {label}
        </p>
      )}
    </div>
  )
}
