import Link from 'next/link'
import { RECENT_COMPLETED_HALF, RECENT_COMPLETED_MAX, timelineDate, type CardGame } from '@/lib/profile-cards'

// The Recently completed card: the last finishes (eight at full width, four
// on a half card or a phone) hanging off a line,
// newest on the left, each with its completion date and hours. The line and
// the newest dot are in the person's accent, fading along the older ones.
// The covers take whatever height the card has (a half card stretches to the
// tallest card in its row), so it never ends in an empty band.

const hours = (h: number | null) =>
  h == null ? null : `${h.toLocaleString(undefined, { maximumFractionDigits: 0 })}h`

// How strongly the line shows the accent at game `i` of `n`, newest first:
// full at the newest, fading along the older ones.
const strength = (i: number, n: number) => Math.max(10, Math.round(100 * (1 - i / n) ** 1.5))
const mix = (accent: string, pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`

export default function RecentTimeline({
  games, accent, full,
}: {
  games: (CardGame & { completedOn: string | null })[]
  accent: string
  full: boolean
}) {
  const thisYear = new Date().getFullYear()
  const shown = games.slice(0, full ? RECENT_COMPLETED_MAX : RECENT_COMPLETED_HALF)
  const n = shown.length
  return (
    <ol className={`grid min-h-0 flex-1 grid-cols-4 ${full ? 'sm:grid-cols-8' : ''}`} aria-label="Recently completed, newest first">
      {shown.map((g, i) => {
        const date = timelineDate(g.completedOn, thisYear)
        return (
          // A phone has room for four, even at full width.
          <li key={g.id} className={`min-h-0 min-w-0 ${i >= RECENT_COMPLETED_HALF ? 'hidden sm:flex' : 'flex'}`}>
            <Link href={`/games/${g.id}`} title={g.title} className="group flex w-full flex-col items-center px-1.5 text-center">
              {/* The cover is as tall as this space (it never sets the space's
                  height itself): its usual size, or more when the card is stretched. */}
              <span className={`relative w-full flex-1 ${full ? 'min-h-[88px] sm:min-h-[140px]' : 'min-h-[88px] sm:min-h-[112px]'}`}>
                {g.cover
                  ? <img src={g.cover} alt="" className="absolute bottom-0 left-1/2 aspect-[3/4] h-full max-w-full -translate-x-1/2 rounded-lg object-cover shadow-md transition-transform duration-200 group-hover:-translate-y-1" />
                  : <span className="absolute bottom-0 left-1/2 flex aspect-[3/4] h-full max-w-full -translate-x-1/2 items-center justify-center rounded-lg bg-surface-sunken p-2 text-xs font-semibold text-fg-muted transition-transform duration-200 group-hover:-translate-y-1">{g.title}</span>}
              </span>
              <span className="h-3 w-0.5 bg-fg-muted opacity-40" aria-hidden />
              {/* The line runs through every column; each piece fades from this game's strength to the next one's. */}
              <span className="relative -mx-1.5 flex h-3 items-center justify-center self-stretch" aria-hidden>
                <span
                  className="absolute inset-x-0 h-0.5"
                  style={{ background: `linear-gradient(90deg, ${mix(accent, strength(i, n))}, ${mix(accent, strength(i + 1, n))})` }}
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
