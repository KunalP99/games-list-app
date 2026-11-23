'use client'

import { useEffect, useRef } from 'react'
import { playLevel, shiftDay } from '@/lib/profile-cards'

// The Play calendar card's grid: a column per week (Monday at the top), a
// square per day, darker the more hours the desktop app tracked. In the
// person's accent. On a narrow screen it scrolls sideways, starting at today.

const LEVEL_OPACITY = [0, 0.3, 0.5, 0.75, 1]
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']
/** An empty day: a faint square in the card's own text colour, so it shows on any background. */
const EMPTY = 'color-mix(in srgb, currentColor 9%, transparent)'

const hours = (minutes: number) => `${(Math.round(minutes / 6) / 10).toLocaleString()}h`
const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function Cell({ minutes, accent, title }: { minutes: number; accent: string; title?: string }) {
  const level = playLevel(minutes)
  return (
    <span
      title={title}
      className="block aspect-square w-full rounded-[3px]"
      style={{ backgroundColor: level > 0 ? accent : EMPTY, opacity: level > 0 ? LEVEL_OPACITY[level] : 1 }}
    />
  )
}

export default function PlayCalendar({ start, minutes, accent }: { start: string; minutes: number[]; accent: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollWidth > el.clientWidth + 1) el.scrollLeft = el.scrollWidth
  }, [])

  const weeks: { day: string; minutes: number }[][] = []
  minutes.forEach((m, i) => {
    if (i % 7 === 0) weeks.push([])
    weeks[weeks.length - 1].push({ day: shiftDay(start, i), minutes: m })
  })

  const total = minutes.reduce((a, b) => a + b, 0)
  const daysPlayed = minutes.filter(m => m > 0).length

  // A month's short name over the first week that starts in it (not the
  // first column, which is usually part of a month already under way).
  const monthLabel = (w: number) => {
    if (w === 0) return ''
    const month = weeks[w][0].day.slice(5, 7)
    return month !== weeks[w - 1][0].day.slice(5, 7)
      ? new Date(`${weeks[w][0].day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
      : ''
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        <span className="font-display text-3xl leading-[0.9] text-fg-base tabular-nums">{Math.round(total / 60).toLocaleString()}h</span>
        {' '}tracked on {daysPlayed} {daysPlayed === 1 ? 'day' : 'days'} in the last year
      </p>

      <div ref={scroller} className="overflow-x-auto pb-1">
        {/* One grid: the day names in the first column, then a column per
            week, filled top to bottom (the month name, then Monday…Sunday). */}
        <div
          className="grid min-w-[640px] gap-[3px] text-[10px] leading-none text-fg-muted"
          style={{
            gridTemplateColumns: `auto repeat(${weeks.length}, minmax(0, 1fr))`,
            gridTemplateRows: '14px repeat(7, auto)',
            gridAutoFlow: 'column',
          }}
          role="img"
          aria-label={`Tracked play each day for the last year: ${Math.round(total / 60)} hours on ${daysPlayed} days`}
        >
          <span />
          {DAY_LABELS.map((label, i) => <span key={i} className="flex items-center pr-1.5">{label}</span>)}
          {weeks.map((week, w) => [
            <span key={`m${week[0].day}`} className="whitespace-nowrap">{monthLabel(w)}</span>,
            ...Array.from({ length: 7 }, (_, d) => {
              const cell = week[d]
              return cell
                ? <Cell key={cell.day} minutes={cell.minutes} accent={accent} title={`${longDate(cell.day)}: ${cell.minutes > 0 ? hours(cell.minutes) : 'no play'}`} />
                : <span key={`${week[0].day}-${d}`} />
            }),
          ])}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[11px] text-fg-muted" aria-hidden>
        <span className="mr-1">Less</span>
        {[0, 30, 90, 180, 300].map(m => <span key={m} className="w-3"><Cell minutes={m} accent={accent} /></span>)}
        <span className="ml-1">More</span>
      </div>
    </div>
  )
}
