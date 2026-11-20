import Link from 'next/link'
import LiveIndicator from '@/components/games/LiveIndicator'
import HeroActions from './HeroActions'
import { formatActivityDate } from '@/lib/activity'
import type { Hero } from '@/lib/dashboard'

export type HeroGame = {
  id: string
  title: string
  status: string
  hours_played: number | null
  platform: string | null
  artwork_url: string | null
  image_url: string | null
  is_favourite: boolean | null
}

/** "2h ago", "yesterday", "28 Oct", lower-cased to sit mid-sentence. */
function lastPlayedLabel(iso: string): string {
  const label = formatActivityDate(iso)
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/**
 * The top of the new dashboard: the Playing or Ambient game you played most
 * recently (live while the tracker sees it). Only a Playing game offers "Mark
 * as completed". `pickHero` in lib/dashboard.ts decides which. With neither
 * (nothing in Playing, and in the friends edition nothing in Ambient), there's
 * no card at all: the dashboard just starts with your stats.
 */
export default function HeroCard({ hero }: { hero: Hero<HeroGame> | null }) {
  if (!hero) return null

  const { game, kind, liveSince, lastPlayedAt } = hero
  const art = game.artwork_url ?? game.image_url
  const meta = [
    kind === 'ambient' ? 'Ambient' : null,
    game.hours_played != null ? `${game.hours_played}h logged` : null,
    game.platform,
  ].filter(Boolean).join(' · ')

  return (
    <section aria-label="Your current game" className="group relative min-h-[300px] rounded-2xl overflow-hidden bg-zinc-900 text-white flex flex-col justify-end">
      {art ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ backgroundImage: `url(${art})` }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-20" aria-hidden>🎮</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

      <div className="relative p-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[320px]">
          {/* -ml matches px: the badge's text lines up with the title below,
              and its dark pill sits slightly out into the margin. */}
          <span className="-ml-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1">
            {liveSince ? (
              <LiveIndicator startedAt={liveSince} dark />
            ) : (
              <span className="text-xs font-medium text-white/85">
                {lastPlayedAt ? `Last played ${lastPlayedLabel(lastPlayedAt)}` : kind === 'playing' ? 'On your Playing list' : 'Ambient'}
              </span>
            )}
          </span>
          <h2 className="mt-2.5 text-3xl font-bold tracking-tight drop-shadow">
            <Link href={`/games/${game.id}`} className="hover:underline decoration-2 underline-offset-4">{game.title}</Link>
          </h2>
          {meta && <p className="mt-1 text-sm text-white/80">{meta}</p>}
        </div>
        <HeroActions gameId={game.id} canComplete={kind === 'playing'} initialFavourite={!!game.is_favourite} />
      </div>
    </section>
  )
}
