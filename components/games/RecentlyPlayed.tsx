import Link from 'next/link'
import LiveIndicator from './LiveIndicator'
import type { Game } from '@/lib/types'

function Cover({ game }: { game: Game }) {
  const cover = (game as { cover_image_url?: string | null }).cover_image_url ?? null
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cover} alt={game.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
      <span className="text-2xl opacity-60">🎮</span>
      <span className="text-[11px] font-medium text-fg-muted line-clamp-2">{game.title}</span>
    </div>
  )
}

/**
 * The last few Ambient games played, in the spirit of a Steam profile.
 *
 * The most recent one — the one someone's actually mid-session in, most of
 * the time, since `getRecentlyPlayed` orders by session start and a live
 * session is by definition the newest — gets a wide landscape hero; the rest
 * sit beside it as small portrait covers. Deliberately not a uniform grid of
 * identical cards: this strip exists to say "here's what you've actually
 * been playing lately", and one of those answers is usually more current
 * than the others.
 *
 * Separate from Now Playing on purpose: that section is the games someone
 * chose, usually through the wheel, and this one is what they have actually
 * been running. Mixing them would blur the line Ambient exists to draw.
 */
export default function RecentlyPlayed({
  games,
  heading = 'Recently Played',
  liveSessions = new Map(),
}: {
  games: Game[]
  heading?: string
  liveSessions?: Map<string, string>
}) {
  if (games.length === 0) return null

  const [hero, ...rest] = games
  const banner = (hero as { artwork_url?: string | null }).artwork_url ?? hero.image_url
  const heroLive = liveSessions.get(hero.id) ?? null

  return (
    <div>
      <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
        {heading}
      </h2>
      {/* Spans the page: the hero takes the spare width, and the covers keep
          their portrait shape and set the row's height, which the hero
          stretches to match. On phones the hero sits on its own row above
          the covers. The hero's min-height is load-bearing: with only one
          recently played game there are no covers to take the height from,
          and it collapsed to nothing on wide screens. */}
      <div className="grid grid-cols-4 sm:grid-cols-[minmax(0,2.8fr)_repeat(4,minmax(0,1fr))] gap-4">
        <Link
          href={`/games/${hero.id}`}
          className="group relative block col-span-4 sm:col-span-1 h-[200px] sm:h-auto sm:min-h-[200px] rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
        >
          <div className="absolute inset-0 bg-surface-active">
            {banner ? (
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url(${banner})` }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="text-4xl opacity-60">🎮</span>
                <span className="text-sm font-medium text-fg-muted">{hero.title}</span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="font-semibold text-white text-lg truncate drop-shadow">{hero.title}</h3>
            {(hero.developer || hero.platform) && (
              <p className="text-xs text-white/70 mt-0.5 drop-shadow truncate">
                {[hero.developer, hero.platform].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="mt-1.5">
              {heroLive ? (
                <LiveIndicator startedAt={heroLive} dark />
              ) : hero.hours_played != null ? (
                <span className="text-xs text-white/70 drop-shadow">{hero.hours_played}h logged</span>
              ) : null}
            </div>
          </div>
        </Link>

        {rest.map(game => {
          const live = liveSessions.get(game.id) ?? null
          return (
            <Link
              key={game.id}
              href={`/games/${game.id}`}
              // Portrait box art at 3:4 off the column width. The hero
              // stretches to this height, not the other way round, so the
              // two can't drift apart as the row's width changes.
              className="group relative block aspect-[3/4] rounded-lg overflow-hidden bg-surface-sunken"
            >
              <Cover game={game} />
              {live ? (
                // Live is worth seeing at a glance, not just on hover.
                <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5">
                  <LiveIndicator startedAt={live} dark />
                </span>
              ) : game.hours_played != null ? (
                // Hours, on the other hand, are only worth a hover — otherwise
                // every cover carries a pill all the time, which is exactly
                // the badge-clutter this redesign dropped the title row for.
                <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <span className="text-[11px] font-medium text-white/90">{game.hours_played}h logged</span>
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
