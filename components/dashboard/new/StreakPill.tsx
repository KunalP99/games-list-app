import Link from 'next/link'
import type { StreakStatus } from '@/lib/dashboard'
import AnimatedFlame from '@/components/streak/AnimatedFlame'

const sinceFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * "3 day streak" beside the date, with the profile card's flickering orange
 * flame (`AnimatedFlame`): consecutive UK days with a tracked session
 * (`streakStatus`). An orange pill once you've played today; grey with a
 * nudge when the last session was yesterday (the flame still burns: the
 * streak isn't lost yet); nothing at all once the run is broken.
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
      <AnimatedFlame className="-my-0.5 h-[18px] w-[18px] shrink-0" style={{ filter: 'drop-shadow(0 0 2px rgba(249,115,22,0.45))' }} />
      <span>{streak.days}</span>
      <span className="font-medium">{active ? 'day streak' : 'day streak · play today to keep it'}</span>
    </Link>
  )
}
