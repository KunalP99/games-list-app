import { unstable_cache } from 'next/cache'
import { getUpcomingEvents } from '@/lib/igdb'

// Cache the IGDB call so the dashboard doesn't hit the API on every load — the
// igdbQuery POST isn't cached by Next automatically, and events change slowly.
// Cache key is versioned — bump it when the event shape changes so stale
// cached payloads (missing new fields) are discarded rather than served.
const getCachedEvents = unstable_cache(() => getUpcomingEvents(5), ['upcoming-events-v4'], { revalidate: 3600 })

// Whole calendar days from today until a Unix-seconds timestamp.
function daysUntil(startTime: number): number {
  const start = new Date(startTime * 1000)
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((startDay.getTime() - today.getTime()) / 86_400_000)
}

// "yesterday" / "today" / "tomorrow" / "in N days" / "N days ago".
function countdown(startTime: number): string {
  const days = daysUntil(startTime)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < 0) return `${-days} days ago`
  return `in ${days} days`
}

export async function UpcomingEventsSection() {
  const events = await getCachedEvents()
  if (events.length === 0) return null

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
        Upcoming Events
      </h2>
      <div className="flex-1 flex flex-col bg-surface-base border border-edge-base rounded-xl overflow-hidden divide-y divide-edge-subtle">
        {events.map(event => {
          const date = new Date(event.startTime * 1000)
          const day = date.toLocaleDateString('en-GB', { day: 'numeric' })
          const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
          const full = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          // Show a time only when one is actually set — a midnight-UTC start_time is
          // IGDB's convention for a date-only / all-day event.
          const time = event.startTime % 86400 !== 0
            ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : null
          const delta = daysUntil(event.startTime)
          const isToday = delta === 0
          const isPast = delta < 0
          return (
            <div
              key={event.id}
              className={`flex-1 flex items-center gap-3 px-4 py-3 ${isToday ? 'bg-brand-50 dark:bg-brand-900/20' : ''} ${isPast ? 'opacity-60' : ''}`}
            >
              {/* Calendar-style date badge — muted for past events */}
              <div className={`flex-shrink-0 w-12 flex flex-col items-center justify-center rounded-lg py-1.5 ${isPast ? 'bg-surface-active text-fg-muted' : 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'}`}>
                <span className="text-lg font-bold leading-none">{day}</span>
                <span className="text-[10px] font-semibold tracking-wider leading-none mt-0.5">{month}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-medium truncate ${isPast ? 'line-through text-fg-muted' : 'text-fg-base'}`}>{event.name}</p>
                <p className="text-xs text-fg-muted mt-0.5">{full}{time ? `, ${time}` : ''} · {countdown(event.startTime)}</p>
              </div>
              {/* Where to watch — per-network links, falling back to the single stream URL */}
              {(event.networks ?? []).length > 0 ? (
                <div className="flex-shrink-0 flex flex-wrap gap-1 justify-end max-w-[46%]">
                  {(event.networks ?? []).map(n => (
                    <a
                      key={n.type}
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-edge-base text-fg-secondary hover:border-brand-400 hover:text-brand-600 transition-colors dark:hover:text-brand-400"
                    >
                      {n.type}
                    </a>
                  ))}
                </div>
              ) : event.liveStreamUrl ? (
                <a
                  href={event.liveStreamUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors dark:hover:text-brand-400"
                >
                  Watch ↗
                </a>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function UpcomingEventsSkeleton() {
  return (
    <div>
      <div className="h-3 w-32 bg-surface-active rounded mb-3 animate-pulse" />
      <div className="h-[248px] bg-surface-base border border-edge-base rounded-xl animate-pulse" />
    </div>
  )
}
