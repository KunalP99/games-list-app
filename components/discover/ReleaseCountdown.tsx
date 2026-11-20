'use client'

import { useEffect, useState } from 'react'
import { countdown } from '@/lib/store-page'

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * "Out in 23 days 14 hours" for a game not out yet, re-counted every minute;
 * minutes join on the last day. Starts from the server's count (`initialNow`),
 * so the first paint matches and nothing jumps when the page wakes up.
 */
export default function ReleaseCountdown({ releaseDate, initialNow }: { releaseDate: number; initialNow: number }) {
  const [now, setNow] = useState(initialNow)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const left = countdown(releaseDate, now)
  if (!left) return null

  const parts: [number, string][] = [[left.days, left.days === 1 ? 'day' : 'days'], [left.hours, left.hours === 1 ? 'hour' : 'hours']]
  if (left.lastDay) parts.push([left.minutes, left.minutes === 1 ? 'minute' : 'minutes'])

  return (
    <section aria-label="Release countdown" className="rounded-xl border border-edge-base bg-surface-base p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Out in</p>
      <div className="mt-1.5 flex justify-center gap-5 tabular-nums">
        {parts.filter(([n], i) => n > 0 || i > 0 || !left.lastDay).map(([n, label]) => (
          <div key={label}>
            <p className="text-3xl font-bold leading-none text-fg-base">{n}</p>
            <p className="mt-1 text-xs text-fg-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-sm text-fg-secondary">{dateFormat.format(new Date(releaseDate * 1000))}</p>
    </section>
  )
}
