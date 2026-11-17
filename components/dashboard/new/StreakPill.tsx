import Link from 'next/link'
import type { StreakStatus } from '@/lib/dashboard'

const sinceFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * "🔥 3 day streak" beside the date: consecutive UK days with a tracked
 * session (`streakStatus`). Orange and filled once you've played today; grey
 * with an outline flame and a nudge when the last session was yesterday;
 * nothing at all once the run is broken.
 */
export default function StreakPill({ streak }: { streak: StreakStatus | null }) {
  if (!streak) return null
  const active = streak.state === 'active'
  const since = sinceFormat.format(new Date(`${streak.since}T00:00:00Z`))

  return (
    <Link
      href="/stats"
      title={streak.days > 1 ? `Played every day since ${since}` : 'Played today'}
      className={`inline-flex items-center gap-1 h-6 pl-2 pr-2.5 rounded-full text-[13px] font-bold transition-colors ${
        active
          ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/25'
          : 'bg-surface-active text-fg-secondary hover:text-fg-base'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
        <path d="M12 2.5c.8 3.2 4.5 5 4.5 10a4.5 4.5 0 0 1-9 0c0-2 .9-3.4 1.9-4.3.2 1.7 1 2.8 2.1 3.1-.3-3.2.1-6.2.5-8.8z" />
      </svg>
      <span>{streak.days}</span>
      <span className="font-medium">{active ? 'day streak' : 'day streak · play today to keep it'}</span>
    </Link>
  )
}
