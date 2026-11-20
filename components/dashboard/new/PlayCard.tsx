'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import { formatPlayMinutes, PLAY_PERIODS, type PlayPeriod, type PlaySummary, type PlayBar } from '@/lib/dashboard'

const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const dayOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

const asDate = (day: string) => new Date(`${day}T00:00:00Z`)

const TITLES: Record<PlayPeriod, string> = { week: 'Your week', month: 'Your month', year: 'Your year' }

/** Per period: how tall the tallest bar is, and how far apart the bars start rising. */
const CHART: Record<PlayPeriod, { maxPx: number; step: string }> = {
  week: { maxPx: 84, step: '80ms' },
  month: { maxPx: 84, step: '30ms' },
  year: { maxPx: 84, step: '50ms' },
}

/** "11 – 17 Nov", "19 Oct – 17 Nov", "1 Dec 2025 – 17 Nov 2026". */
function rangeLabel(start: string, end: string): string {
  const a = asDate(start)
  const b = asDate(end)
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dayMonthYear.format(a)} – ${dayMonthYear.format(b)}`
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dayMonth.format(a)} – ${dayMonth.format(b)}`
  return `${dayOnly.format(a)} – ${dayMonth.format(b)}`
}

/** What a bar covers, for its tooltip and the header while it's hovered. */
function barLabel(bar: PlayBar): string {
  // A day (week, month view) or a calendar month (year view).
  const when = bar.start === bar.end ? dayMonth.format(asDate(bar.start)) : monthYear.format(asDate(bar.start))
  return `${when}: ${formatPlayMinutes(bar.minutes) || 'no play'}`
}

/**
 * Tracked play over the last week, month or year, picked from the menu on the
 * title. Week and month are a bar per day, the year a bar per calendar
 * month; the month and year scroll sideways, opening on today. All three are
 * worked out on the server
 * (`playSummary`), so switching is instant. Bars rise one by one on every
 * visit and every switch: the chart is keyed on the period, so it remounts.
 */
export default function PlayCard({ summaries, titles }: {
  summaries: Record<PlayPeriod, PlaySummary>
  titles: Record<string, string>
}) {
  const [period, setPeriod] = useState<PlayPeriod>('week')
  const [active, setActive] = useState<number | null>(null)
  const summary = summaries[period]
  const { bars } = summary
  const topTitle = summary.topGameId ? titles[summary.topGameId] : undefined

  const pick = (p: PlayPeriod) => { setPeriod(p); setActive(null) }

  return (
    <div className="rounded-2xl bg-surface-base border border-edge-base p-5 space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <PeriodMenu period={period} onPick={pick} />
          <p className="mt-0.5 text-xs text-fg-muted truncate" aria-live="polite">
            {active != null && bars[active] ? barLabel(bars[active]) : rangeLabel(bars[0].start, bars[bars.length - 1].end)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-[30px] leading-[0.9] text-fg-base">{formatPlayMinutes(summary.totalMinutes) || '0h'}</p>
          <p className="mt-1 text-xs text-fg-muted">played</p>
        </div>
      </div>

      <Chart key={period} summary={summary} active={active} onActive={setActive} />

      <div className="space-y-1.5 pt-3 border-t border-edge-subtle text-[13px]">
        <div className="flex justify-between gap-2">
          <span className="text-fg-muted shrink-0">Most played</span>
          {summary.topGameId && topTitle ? (
            <Link href={`/games/${summary.topGameId}`} className="font-semibold text-fg-base text-right truncate hover:text-brand-600 dark:hover:text-brand-400">{topTitle}</Link>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-fg-muted">Days played</span>
          <span className="font-semibold text-fg-base">{summary.daysPlayed} of {summary.dayCount}</span>
        </div>
      </div>
    </div>
  )
}

function PeriodMenu({ period, onPick }: { period: PlayPeriod; onPick: (p: PlayPeriod) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative">
      <h2>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="-ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[15px] font-semibold text-fg-base hover:bg-surface-hover transition-colors"
        >
          {TITLES[period]}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden
            className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h2>
      {open && (
        <ul role="listbox" aria-label="Period" className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border border-edge-base bg-surface-base p-1 shadow-lg">
          {PLAY_PERIODS.map(p => (
            <li key={p} role="option" aria-selected={p === period}>
              <button
                type="button"
                onClick={() => { onPick(p); setOpen(false) }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-surface-hover ${p === period ? 'font-semibold text-fg-base' : 'text-fg-secondary'}`}
              >
                {TITLES[p]}
                {p === period && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="text-brand-600 dark:text-brand-400"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Chart({ summary, active, onActive }: { summary: PlaySummary; active: number | null; onActive: (i: number | null) => void }) {
  const { period, bars } = summary
  const { maxPx, step } = CHART[period]
  const max = Math.max(1, ...bars.map(b => b.minutes))
  const scroller = useRef<HTMLDivElement>(null)

  // The year opens on today, at the right-hand end.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  // A vertical mouse wheel scrolls the year sideways, until it reaches an end;
  // then the page scrolls as normal.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
      if (atStart || atEnd) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const last = bars.length - 1
  const bar = (b: PlayBar, i: number) => {
    const isLast = i === last
    return (
      <div
        // Week: the bar widens with its day's column (80%, up to 48px), so a
        // wider card gets wider bars rather than wider gaps between them.
        className={`animate-week-bar ${period === 'week' ? 'w-[80%] max-w-[48px] rounded-md' : 'w-full rounded-md'} ${
          b.minutes > 0
            ? isLast || active === i ? 'bg-brand-600 dark:bg-brand-500' : 'bg-brand-600/70 dark:bg-brand-500/70'
            : 'bg-surface-active'
        }`}
        style={{ '--i': i, '--step': step, height: b.minutes > 0 ? Math.max(8, Math.round((b.minutes / max) * maxPx)) : 4 } as CSSProperties}
      />
    )
  }
  const hover = (i: number) => ({
    title: barLabel(bars[i]),
    // Mouse only: on touch, the tap that picked the period from the menu would
    // otherwise "hover" whichever bar sits under it. Touch uses the tap below.
    onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') onActive(i) },
    onClick: () => onActive(i),
  })

  if (period === 'week') {
    return (
      <div onPointerLeave={() => onActive(null)}>
        <div className="grid grid-cols-7 gap-1.5 items-end h-28">
          {bars.map((b, i) => (
            <div key={b.start} {...hover(i)} className="h-full flex flex-col justify-end items-center gap-1">
              <span style={{ '--i': i, '--step': step } as CSSProperties}
                className={`animate-week-label text-[11px] font-semibold tabular-nums ${i === last ? 'text-fg-base' : 'text-fg-secondary'}`}>
                {formatPlayMinutes(b.minutes)}
              </span>
              {bar(b, i)}
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {bars.map((b, i) => (
            <span key={b.start} className={`text-center text-[11px] ${i === last ? 'font-bold text-fg-base' : 'font-medium text-fg-muted'}`}>
              {i === last ? 'Today' : dayName.format(asDate(b.start))}
            </span>
          ))}
        </div>
      </div>
    )
  }

  // Month: a wide bar per day with its value on top, like the week, so it
  // scrolls too. The day of the month sits under each bar, and the month's
  // name under the first day, each 1st, and today (where it opens).
  if (period === 'month') {
    return (
      <div ref={scroller} onPointerLeave={() => onActive(null)} className="-mx-1 px-1 overflow-x-auto overscroll-x-contain pb-1.5 [scrollbar-width:thin]">
        <div className="flex gap-1.5 w-max">
          {bars.map((b, i) => {
            const date = asDate(b.start)
            const isLast = i === last
            const showMonth = i === 0 || i === last || date.getUTCDate() === 1
            return (
              <div key={b.start} {...hover(i)} className="w-5 shrink-0">
                <div className="h-28 flex flex-col justify-end items-center gap-1">
                  <span style={{ '--i': i, '--step': step } as CSSProperties}
                    className={`animate-week-label whitespace-nowrap text-[10px] font-semibold tabular-nums ${isLast ? 'text-fg-base' : 'text-fg-secondary'}`}>
                    {formatPlayMinutes(b.minutes)}
                  </span>
                  {bar(b, i)}
                </div>
                <span className={`mt-1.5 block text-center text-[11px] tabular-nums ${isLast ? 'font-bold text-fg-base' : 'font-medium text-fg-muted'}`}>
                  {dayOnly.format(date)}
                </span>
                <span className="block h-3.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {showMonth ? monthName.format(date) : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Year: a wide bar per calendar month with its hours on top, so it scrolls
  // like the month. The year sits under January and under the first month.
  return (
    <div ref={scroller} onPointerLeave={() => onActive(null)} className="-mx-1 px-1 overflow-x-auto overscroll-x-contain pb-1.5 [scrollbar-width:thin]">
      <div className="flex gap-2 w-max">
        {bars.map((b, i) => {
          const date = asDate(b.start)
          const isLast = i === last
          const showYear = i === 0 || date.getUTCMonth() === 0
          return (
            <div key={b.start} {...hover(i)} className="w-8 shrink-0">
              <div className="h-28 flex flex-col justify-end items-center gap-1">
                <span style={{ '--i': i, '--step': step } as CSSProperties}
                  className={`animate-week-label whitespace-nowrap text-[11px] font-semibold tabular-nums ${isLast ? 'text-fg-base' : 'text-fg-secondary'}`}>
                  {formatPlayMinutes(b.minutes)}
                </span>
                {bar(b, i)}
              </div>
              <span className={`mt-1.5 block text-center text-[11px] ${isLast ? 'font-bold text-fg-base' : 'font-medium text-fg-muted'}`}>
                {monthName.format(date)}
              </span>
              <span className="block h-3.5 text-center text-[10px] font-semibold tracking-wide text-fg-subtle">
                {showYear ? date.getUTCFullYear() : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
