import Link from 'next/link'
import { RECENT_COMPLETED_MAX, timelineDate, type CardGame } from '@/lib/profile-cards'

// The Recently completed card: the last four finishes hanging off a line,
// newest on the left, each with its completion date and hours. The line and
// the newest dot are in the person's accent, fading along the older ones.

const hours = (h: number | null) =>
  h == null ? null : `${h.toLocaleString(undefined, { maximumFractionDigits: 0 })}h`

// How strongly each step of the line shows the accent, newest first.
const STRENGTH = [100, 55, 35, 22, 12]
const mix = (accent: string, pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`

export default function RecentTimeline({
  games, accent, full,
}: {
  games: (CardGame & { completedOn: string | null })[]
  accent: string
  full: boolean
}) {
  const thisYear = new Date().getFullYear()
  return (
    <ol className="grid grid-cols-4" aria-label="Recently completed, newest first">
      {games.slice(0, RECENT_COMPLETED_MAX).map((g, i) => {
        const date = timelineDate(g.completedOn, thisYear)
        return (
          <li key={g.id} className="min-w-0">
            <Link href={`/games/${g.id}`} title={g.title} className="group flex flex-col items-center px-1.5 text-center">
              <span className={`block w-full ${full ? 'max-w-[104px]' : 'max-w-[84px]'}`}>
                {g.cover
                  ? <img src={g.cover} alt="" className="aspect-[3/4] w-full rounded-lg object-cover shadow-md transition-transform duration-200 group-hover:-translate-y-1" />
                  : <span className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-surface-sunken p-2 text-xs font-semibold text-fg-muted transition-transform duration-200 group-hover:-translate-y-1">{g.title}</span>}
              </span>
              <span className="h-3 w-0.5 bg-fg-muted opacity-40" aria-hidden />
              {/* The line runs through every column; each piece fades from this game's strength to the next one's. */}
              <span className="relative -mx-1.5 flex h-3 items-center justify-center self-stretch" aria-hidden>
                <span
                  className="absolute inset-x-0 h-0.5"
                  style={{ background: `linear-gradient(90deg, ${mix(accent, STRENGTH[i])}, ${mix(accent, STRENGTH[i + 1])})` }}
                />
                <span
                  className="relative h-3 w-3 rounded-full ring-4 ring-surface-base"
                  style={{ backgroundColor: i === 0 ? accent : 'var(--color-fg-muted, #71717a)' }}
                />
              </span>
              <span className="sr-only">{g.title}, </span>
              <span className="mt-2 text-xs font-semibold text-fg-base tabular-nums">{date ?? 'Completed'}</span>
              {hours(g.hours) && <span className="text-[11px] text-fg-muted tabular-nums">{hours(g.hours)}</span>}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
