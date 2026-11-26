import Link from 'next/link'
import LiveIndicator from '@/components/games/LiveIndicator'
import { spotlightOrder, timelineDate, type PlayingGame } from '@/lib/profile-cards'

// The Currently playing card, as a poster: one game (the one running now,
// else the latest started) with its art filling the card, the title big at
// the bottom with its hours, platform and start date, and the live timer
// top-right while it runs. Its height comes from its row (a half card beside
// squares is square-high), so nothing here sets one beyond a sensible minimum.

const hoursText = (h: number | null) =>
  h == null || h <= 0 ? null : `${h.toLocaleString(undefined, { maximumFractionDigits: 0 })}h played`

export default function PlayingSpotlight({ games, title }: { games: PlayingGame[]; title: string }) {
  const [game] = spotlightOrder(games)
  if (!game) return null
  const since = timelineDate(game.startedOn, new Date().getFullYear())
  const details = [hoursText(game.hours), game.platform, since && `since ${since}`].filter(Boolean).join(' · ')
  return (
    <Link
      href={`/games/${game.id}`}
      className="group relative isolate flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl bg-zinc-900 p-5 text-white"
    >
      {(game.wide ?? game.cover) && (
        <img
          src={game.wide ?? game.cover ?? undefined}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/20 to-black/55" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {game.liveSince && (
          <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold">
            <LiveIndicator startedAt={game.liveSince} dark />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 font-display text-4xl leading-tight">{game.title}</p>
        {details && <p className="mt-1.5 truncate text-xs text-white/80">{details}</p>}
      </div>
    </Link>
  )
}
