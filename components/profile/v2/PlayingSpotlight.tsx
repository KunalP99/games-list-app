import Link from 'next/link'
import LiveIndicator from '@/components/games/LiveIndicator'
import { spotlightOrder, type PlayingGame } from '@/lib/profile-cards'

// The Currently playing card: the game being played right now (else the
// latest started) big, in its own art, and the rest listed beside it (under
// it on a half card or a phone).

const hoursText = (h: number | null) =>
  h == null || h <= 0 ? null : `${h.toLocaleString(undefined, { maximumFractionDigits: 0 })}h`

function Spotlight({ game, full }: { game: PlayingGame; full: boolean }) {
  const details = [hoursText(game.hours) && `${hoursText(game.hours)} played`, game.platform].filter(Boolean).join(' · ')
  return (
    <Link
      href={`/games/${game.id}`}
      className={`group relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-xl bg-zinc-800 p-4 text-white ${full ? 'min-h-[200px]' : 'min-h-[160px]'}`}
    >
      {game.wide && (
        <img src={game.wide} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" aria-hidden />
      {game.liveSince && (
        <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold">
          <LiveIndicator startedAt={game.liveSince} dark />
        </span>
      )}
      <span className={`relative block truncate font-display leading-tight ${full ? 'text-3xl' : 'text-2xl'}`}>{game.title}</span>
      {details && <span className="relative mt-1 block truncate text-xs text-white/85">{details}</span>}
    </Link>
  )
}

function Row({ game }: { game: PlayingGame }) {
  const details = [game.liveSince ? null : hoursText(game.hours), game.platform].filter(Boolean).join(' · ')
  return (
    <Link href={`/games/${game.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-surface-hover">
      {game.cover
        ? <img src={game.cover} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" />
        : <span className="h-12 w-9 shrink-0 rounded-md bg-surface-sunken" aria-hidden />}
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-fg-base">{game.title}</span>
        {game.liveSince
          ? <span className="block truncate text-[11px] text-emerald-600 dark:text-emerald-400"><LiveIndicator startedAt={game.liveSince} /></span>
          : details && <span className="block truncate text-[11px] text-fg-muted">{details}</span>}
      </span>
    </Link>
  )
}

export default function PlayingSpotlight({ games, full }: { games: PlayingGame[]; full: boolean }) {
  const [first, ...rest] = spotlightOrder(games)
  const shown = rest.slice(0, full ? 3 : 2)
  const more = rest.length - shown.length
  if (!first) return null
  if (shown.length === 0) return <div className="flex flex-1"><Spotlight game={first} full={full} /></div>
  return (
    <div className={`flex flex-1 flex-col gap-3 ${full ? 'sm:flex-row sm:gap-4' : ''}`}>
      <Spotlight game={first} full={full} />
      <div className={full ? 'flex flex-col justify-center gap-1.5 sm:w-56 sm:shrink-0' : 'flex gap-2'}>
        {full && <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Also playing</p>}
        {shown.map(g => <Row key={g.id} game={g} />)}
        {full && more > 0 && <p className="px-1 text-[11px] text-fg-muted">+{more} more</p>}
      </div>
    </div>
  )
}
