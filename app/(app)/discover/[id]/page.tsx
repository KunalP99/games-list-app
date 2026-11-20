import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/edition'
import { getCachedStoreGame, getCachedDeveloperGames } from '@/lib/data/store-game'
import { getFriendIds } from '@/lib/data/friends'
import { getSteamReviewSummary, steamReviewBadge } from '@/lib/steam'
import { allowRequest, IGDB_LOOKUP } from '@/lib/rate-limit'
import { isUpcoming, isYearOnly, type StoreRelated } from '@/lib/store-page'
import { pickRow } from '@/lib/trackable-row'
import type { GameStatus } from '@/lib/types'
import StoreMedia from '@/components/discover/StoreMedia'
import StoreSummary from '@/components/discover/StoreSummary'
import StoreAddBar from '@/components/discover/StoreAddBar'
import ReleaseCountdown from '@/components/discover/ReleaseCountdown'
import FriendsWhoHaveIt, { type FriendCopy } from '@/components/discover/FriendsWhoHaveIt'
import AddOnsList, { type AddOnRow } from '@/components/discover/AddOnsList'

const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const STEAM_TONE = { positive: 'text-blue-700 dark:text-blue-400', mixed: 'text-amber-700 dark:text-amber-400', negative: 'text-red-700 dark:text-red-400' } as const

/**
 * A store-style page for any game on IGDB (public edition, FEATURES.gameStore),
 * opened from the dashboard's search: trailer and screenshots, IGDB and Steam
 * ratings, facts, DLC and editions, where to buy, friends who have it, and
 * adding it to your library. IGDB data via lib/data/store-game.ts (cached).
 */
export default async function DiscoverGamePage(props: { params: Promise<{ id: string }> }) {
  if (!FEATURES.gameStore) notFound()
  const { id: rawId } = await props.params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Each page view counts against the account's IGDB lookups, as opening a
  // game elsewhere does; the IGDB answer itself is cached for an hour.
  if (!(await allowRequest(user.id, IGDB_LOOKUP))) {
    return <p className="py-16 text-center text-fg-muted">You’ve opened a lot of games in a short time. Wait a moment and try again.</p>
  }

  const game = await getCachedStoreGame(id)
  if (!game) notFound()

  const friendIds = await getFriendIds(supabase, user.id)
  const [devGames, steamSummary, ownedRes, friendGamesRes] = await Promise.all([
    getCachedDeveloperGames(id),
    getSteamReviewSummary(game.steamAppId),
    supabase.from('games').select('id, status, hours_played, title').eq('user_id', user.id).eq('igdb_id', id).order('updated_at', { ascending: false }) as unknown as Promise<{ data: { id: string; status: GameStatus; hours_played: number | null; title: string }[] | null }>,
    friendIds.length > 0
      ? supabase.from('games').select('user_id, status, hours_played').eq('igdb_id', id).in('user_id', friendIds) as unknown as Promise<{ data: { user_id: string; status: string; hours_played: number | null }[] | null }>
      : Promise.resolve({ data: [] as { user_id: string; status: string; hours_played: number | null }[] }),
  ])

  const ownedRow = pickRow(ownedRes.data ?? [])
  const owned = ownedRow ? { id: ownedRow.id, status: ownedRow.status, hours: ownedRow.hours_played } : null

  // One entry per friend (their best copy: Playing first), with who they are.
  const byFriend = new Map<string, { status: string; hours: number | null }>()
  for (const g of friendGamesRes.data ?? []) {
    const prev = byFriend.get(g.user_id)
    if (!prev || (g.status === 'playing' && prev.status !== 'playing')) byFriend.set(g.user_id, { status: g.status, hours: g.hours_played })
  }
  const { data: friendProfiles } = byFriend.size > 0
    ? await supabase.from('profiles').select('id, username, display_name, accent_colour').in('id', [...byFriend.keys()]) as unknown as { data: { id: string; username: string; display_name: string | null; accent_colour: string | null }[] | null }
    : { data: [] }
  const friends: FriendCopy[] = (friendProfiles ?? []).map(p => ({
    userId: p.id, username: p.username, displayName: p.display_name ?? p.username, accentColour: p.accent_colour,
    ...byFriend.get(p.id)!,
  }))

  // eslint-disable-next-line react-hooks/purity -- server component: runs once per request
  const now = Date.now()
  const upcoming = isUpcoming(game.releaseDate, now)
  const steam = steamReviewBadge(steamSummary)
  const hasRatings = game.criticScore != null || game.playerScore != null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg-base">{game.name}</h1>
        {upcoming && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Not out yet</span>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[999_1_560px]">
          <StoreMedia name={game.name} videos={game.videos} screenshots={game.screenshots} />
        </div>

        <aside className="min-w-0 flex-[1_1_300px] space-y-4">
          {upcoming && game.releaseDate != null && !isYearOnly(game.releaseDate) && <ReleaseCountdown releaseDate={game.releaseDate} initialNow={now} />}
          {upcoming && (game.releaseDate == null || isYearOnly(game.releaseDate)) && (
            <section aria-label="Release" className="rounded-xl border border-edge-base bg-surface-base p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Coming</p>
              <p className="mt-1 text-3xl font-bold text-fg-base">{game.releaseDate != null ? new Date(game.releaseDate * 1000).getUTCFullYear() : 'Soon'}</p>
              <p className="mt-1 text-sm text-fg-secondary">{game.releaseDate != null ? 'No exact date yet' : 'No release date yet'}</p>
            </section>
          )}
          {!upcoming && game.capsule && (
            <img src={game.capsule} alt="" className="aspect-[460/215] w-full rounded-xl object-cover" />
          )}
          {game.summary && <StoreSummary text={game.summary} />}

          {hasRatings ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">IGDB rating</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-sm">
                {game.criticScore != null && (<><dt className="text-fg-muted">Critics</dt><dd><strong className="text-fg-base">{game.criticScore}</strong> / 100 <span className="text-fg-muted">· {game.criticCount.toLocaleString()} {game.criticCount === 1 ? 'review' : 'reviews'}</span></dd></>)}
                {game.playerScore != null && (<><dt className="text-fg-muted">Players</dt><dd><strong className="text-fg-base">{game.playerScore}</strong> / 100 <span className="text-fg-muted">· {game.playerCount.toLocaleString()} {game.playerCount === 1 ? 'rating' : 'ratings'}</span></dd></>)}
              </dl>
            </div>
          ) : null}

          <dl className={`grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-sm ${hasRatings ? 'border-t border-edge-subtle pt-3' : ''}`}>
            {steam && (<><dt className="text-fg-muted">Steam</dt><dd className={`font-semibold ${STEAM_TONE[steam.tone]}`}>{steam.label}</dd></>)}
            {upcoming ? (
              <><dt className="text-fg-muted">Release</dt><dd>{game.releaseLines.length > 0 ? game.releaseLines.map(l => <span key={l} className="block">{l}</span>) : 'To be announced'}</dd></>
            ) : game.releaseDate != null && (
              <><dt className="text-fg-muted">Released</dt><dd>{fullDate.format(new Date(game.releaseDate * 1000))}</dd></>
            )}
            {game.developer && (<><dt className="text-fg-muted">Developer</dt><dd>{game.developer}</dd></>)}
            <dt className="text-fg-muted">Age rating</dt>
            <dd>{game.ageRating ? <span className="inline-block rounded border border-edge-input px-1.5 text-xs font-bold">{game.ageRating}</span> : <span className="text-fg-muted">Not rated yet</span>}</dd>
            {game.players && (<><dt className="text-fg-muted">Players</dt><dd>{game.players}</dd></>)}
            {game.platforms.length > 0 && (<><dt className="text-fg-muted">Platforms</dt><dd>{game.platforms.join(', ')}</dd></>)}
            {upcoming && !hasRatings && (<><dt className="text-fg-muted">Ratings</dt><dd className="text-fg-muted">None yet</dd></>)}
          </dl>

          {(game.genres.length > 0 || game.tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {[...game.genres, ...game.tags].map(t => (
                <span key={t} className="rounded-md bg-surface-active px-2 py-0.5 text-xs text-fg-secondary">{t}</span>
              ))}
            </div>
          )}

          <FriendsWhoHaveIt friends={friends} />
        </aside>
      </div>

      <StoreAddBar
        game={{
          igdbId: game.id,
          name: game.name,
          developer: game.developer,
          image: game.banner,
          genres: game.genres,
          releaseDate: game.releaseDate != null ? new Date(game.releaseDate * 1000).toISOString().slice(0, 10) : null,
        }}
        owned={owned}
        upcoming={upcoming}
        stores={game.storeLinks}
      />

      {(game.dlc.length > 0 || game.editions.length > 0 || game.smallDlc.length > 0) && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-fg-base">DLC and editions</h2>
          <AddOnsList
            rows={[...game.dlc.map(r => addOnRow(r, 'dlc', game.name)), ...game.editions.map(r => addOnRow(r, 'edition', game.name))]}
            more={game.smallDlc.map(r => addOnRow(r, 'dlc', game.name))}
          />
        </section>
      )}

      {devGames && devGames.games.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-fg-base">More from {devGames.developer}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3.5">
            {devGames.games.slice(0, 12).map(g => (
              <Link key={g.id} href={`/discover/${g.id}`} className="group flex flex-col gap-1.5">
                <span className="relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-sunken">
                  {g.coverUrl && <img src={g.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105" />}
                </span>
                <span className="text-sm font-medium leading-snug text-fg-base">{g.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** "The Witcher 3: Wild Hunt - Blood and Wine" under The Witcher 3 reads as "Blood and Wine". */
function shortName(name: string, parent: string): string {
  const prefix = new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–:]\\s*`, 'i')
  return name.replace(prefix, '') || name
}

/** A DLC or edition as a row of the list: short name, and its year or "Coming 2027". */
function addOnRow(item: StoreRelated, kind: 'dlc' | 'edition', parent: string): AddOnRow {
  return {
    id: item.id,
    kind,
    name: shortName(item.name, parent),
    when: item.upcoming ? `Coming${item.year ? ` ${item.year}` : ' soon'}` : item.year != null ? String(item.year) : '',
    upcoming: item.upcoming,
  }
}
