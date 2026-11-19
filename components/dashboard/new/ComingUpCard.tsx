import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCachedEvents } from '@/lib/data/upcoming-events'
import { comingUp, countdownLabel, type ComingUpRelease } from '@/lib/dashboard'
import { londonDay } from '@/lib/activity'

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

/**
 * Backlog games releasing soon and upcoming gaming events, merged by date.
 * Streamed in its own Suspense boundary: the events come from IGDB (cached
 * for an hour, `getCachedEvents` in lib/data/upcoming-events.ts).
 */
export default async function ComingUpCard({ userId }: { userId: string }) {
  const supabase = await createClient()
  const today = londonDay(new Date().toISOString())

  const [{ data: releases }, events] = await Promise.all([
    supabase
      .from('games')
      .select('id, title, release_date, release_date_precision')
      .eq('user_id', userId)
      .eq('status', 'backlog')
      .gte('release_date', today)
      .order('release_date', { ascending: true })
      .limit(10) as unknown as Promise<{ data: ComingUpRelease[] | null }>,
    getCachedEvents().catch(() => []),
  ])

  const items = comingUp(releases ?? [], events)
  if (items.length === 0) return null

  return (
    <div className="rounded-2xl bg-surface-base border border-edge-base p-5">
      <h2 className="text-[15px] font-semibold text-fg-base mb-3">Coming up</h2>
      <ul className="space-y-3">
        {items.map(item => {
          const date = new Date(`${item.day}T00:00:00Z`)
          const detail = item.kind === 'release'
            ? `Release · ${countdownLabel(item.day)} · on your backlog`
            : `Event${item.startTime % 86400 !== 0 ? ` · ${timeFormat.format(new Date(item.startTime * 1000))}` : ''} · ${countdownLabel(item.day)}`
          const body = (
            <>
              <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-edge-base py-1">
                <span className="text-base font-bold leading-none text-fg-base">{dayFormat.format(date)}</span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{monthFormat.format(date)}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg-base truncate">{item.title}</span>
                <span className="block text-xs text-fg-muted">{detail}</span>
              </span>
            </>
          )
          return (
            <li key={item.key}>
              {item.kind === 'release' ? (
                <Link href={`/games/${item.gameId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">{body}</Link>
              ) : item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:opacity-80 transition-opacity">{body}</a>
              ) : (
                <div className="flex items-center gap-3">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ComingUpSkeleton() {
  return <div className="h-40 rounded-2xl bg-surface-base border border-edge-base animate-pulse" />
}
