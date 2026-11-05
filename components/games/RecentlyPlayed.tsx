import Link from 'next/link'
import LiveIndicator from './LiveIndicator'
import DragScroller from './DragScroller'
import { formatActivityDate } from '@/lib/activity'
import type { Game } from '@/lib/types'
import type { RecentlyPlayedGame } from '@/lib/recently-played'

/** "2h ago", "yesterday", "28 Oct" — formatActivityDate, lower-cased to sit mid-sentence. */
function lastPlayedLabel(iso: string): string {
  const label = formatActivityDate(iso)
  return label.charAt(0).toLowerCase() + label.slice(1)
}

function Cover({ game }: { game: Game }) {
  const cover = (game as { cover_image_url?: string | null }).cover_image_url ?? null
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cover} alt={game.title} draggable={false} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
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
  games: RecentlyPlayedGame[]
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
      {/* Spans the page: the hero takes ~40% and the covers the rest. The
          covers keep their portrait shape and set the row's height, which the
          hero stretches to match. They never get narrower than 140px: once
          there's no room for four at that size, the cover row scrolls
          sideways (drag or swipe) instead of squashing them. On phones the
          hero sits on its own row above the covers. The hero's min-height is
          only for when there are no covers to take a height from, where it
          would otherwise collapse to nothing. */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href={`/games/${hero.id}`}
          className={`group relative block h-[200px] sm:h-auto sm:basis-[40%] sm:flex-none sm:min-w-[260px] ${rest.length === 0 ? 'sm:min-h-[200px]' : ''} rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200`}
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
              ) : (
                <span className="text-xs text-white/70 drop-shadow">
                  {[
                    `Last played ${lastPlayedLabel(hero.lastPlayedAt)}`,
                    hero.hours_played != null ? `${hero.hours_played}h logged` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </div>
        </Link>

        <DragScroller className="no-scrollbar flex-1 min-w-0 overflow-x-auto cursor-grab active:cursor-grabbing select-none">
          {/* Always four columns, filled or not, so two games don't balloon
              into two giant covers. */}
          <div className="grid grid-cols-[repeat(4,minmax(140px,1fr))] gap-4">
        {rest.map(game => {
          const live = liveSessions.get(game.id) ?? null
          return (
            <Link
              key={game.id}
              href={`/games/${game.id}`}
              draggable={false}
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
              ) : (
                // When it was last played and the hours, on the other hand,
                // are only worth a hover — otherwise every cover carries text
                // all the time, which is exactly the badge-clutter this
                // redesign dropped the title row for.
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2.5 pb-2 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <p className="text-[11px] font-medium text-white leading-tight">
                    Last played {lastPlayedLabel(game.lastPlayedAt)}
                  </p>
                  {game.hours_played != null && (
                    <p className="text-[11px] text-white/70 leading-tight mt-0.5">{game.hours_played}h logged</p>
                  )}
                </div>
              )}
            </Link>
          )
        })}
          </div>
        </DragScroller>
      </div>
    </div>
  )
}
