import type { createClient } from '@/lib/supabase/server'
import { pickWeekly, weekIndex } from '@/lib/weekly-banner'

// Aggregate library stats for a single user.
//
// This lives in lib/ rather than inside a page because two routes need the same
// numbers: /stats (head-to-head comparison) and /users/[username] (the friend
// profile). It reads a user id, so it works for anyone — there is nothing
// "current user" about it.

export type UserStats = {
  profile: {
    id: string
    display_name: string | null
    username: string
    accent_colour: string | null
    ticket_balance: number
    xp: number
    created_at: string | null
  }
  completedCount: number
  dnfCount: number
  backlogCount: number
  playingCount: number
  ambientCount: number
  totalHours: number
  completionRate: number | null
  avgRating: number | null
  /** Completed games sitting at 100% achievements. */
  perfectedCount: number
  longestGame: { title: string; hours_played: number } | null
  shortestGame: { title: string; hours_played: number } | null
  mostProlificMonth: { label: string; count: number } | null
  ticketsEarned: number
  ticketsSpent: number
  dnfRate: number | null
  achievementsUnlocked: number
  /** This week's banner backdrop, rotated through their 5-star games. Provider
   *  ids are included so the page can try fetching a text-free screenshot for
   *  it (see lib/hero-banner.ts) — artwork_url/cover_image_url are the
   *  guaranteed fallback if that's not possible. */
  heroGame: {
    id: string
    title: string
    artwork_url: string | null
    cover_image_url: string | null
    rawg_id: number | null
    igdb_id: number | null
  } | null
  genreData: { genre: string; count: number }[]
  platformData: { platform: string; count: number }[]
  gamesPerYear: { year: string; count: number; games: { title: string; image_url: string | null }[] }[]
}

export async function computeUserStats(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<UserStats> {
  const [gamesRes, ticketsRes, achievementsRes, profileRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, title, status, hours_played, rating, achievement_progress, completion_date, created_at, genres, platform, image_url, artwork_url, cover_image_url, rawg_id, igdb_id')
      .eq('user_id', userId),
    supabase
      .from('ticket_transactions')
      .select('amount')
      .eq('user_id', userId),
    (supabase.from('user_achievements') as any)
      .select('achievement_id')
      .eq('user_id', userId),
    supabase
      .from('profiles')
      .select('id, display_name, username, accent_colour, ticket_balance, xp, created_at')
      .eq('id', userId)
      .single(),
  ])

  type RawGame = {
    id: string
    title: string
    status: string
    hours_played: number | null
    rating: number | null
    achievement_progress: number | null
    completion_date: string | null
    genres: string[] | null
    platform: string | null
    image_url: string | null
    artwork_url: string | null
    cover_image_url: string | null
    rawg_id: number | null
    igdb_id: number | null
  }

  const games: RawGame[] = gamesRes.data ?? []
  const profile = profileRes.data as UserStats['profile'] | null

  const completedGames = games.filter(g => g.status === 'completed')
  const dnfGames       = games.filter(g => g.status === 'dnf')
  const backlogGames   = games.filter(g => g.status === 'backlog')
  const playingGames   = games.filter(g => g.status === 'playing')
  const ambientGames   = games.filter(g => g.status === 'ambient')

  // Every status, ambient included: those hours were genuinely played, and
  // ongoing games are usually where most of them are. Deliberate, not an
  // oversight — ambient is kept out of the *counts* below, not the hours.
  const totalHours     = games.reduce((s, g) => s + (g.hours_played ?? 0), 0)
  const startedCount   = completedGames.length + dnfGames.length
  const completionRate = startedCount > 0 ? Math.round((completedGames.length / startedCount) * 100) : null
  const dnfRate        = startedCount > 0 ? Math.round((dnfGames.length / startedCount) * 100) : null

  const ratedGames = completedGames.filter(g => g.rating != null)
  const avgRating  = ratedGames.length > 0
    ? Math.round((ratedGames.reduce((s, g) => s + g.rating!, 0) / ratedGames.length) * 10) / 10
    : null

  const perfectedCount = completedGames.filter(g => g.achievement_progress === 100).length

  const completedWithHours = [...completedGames]
    .filter(g => g.hours_played != null)
    .sort((a, b) => b.hours_played! - a.hours_played!)
  const longestGame  = completedWithHours[0]
    ? { title: completedWithHours[0].title, hours_played: completedWithHours[0].hours_played! }
    : null
  const shortestGame = completedWithHours.length > 0
    ? { title: completedWithHours[completedWithHours.length - 1].title, hours_played: completedWithHours[completedWithHours.length - 1].hours_played! }
    : null

  // Banner backdrop: one of their 5-star games, rotating once a week. Sorted by
  // id first because Postgres promises no ordering without an ORDER BY, and
  // pickWeekly indexes into the list — an unstable order would change the
  // banner between requests within the same week.
  const hasArt = (g: RawGame) => Boolean(g.artwork_url || g.cover_image_url)
  const topRated = games
    .filter(g => g.rating != null && g.rating >= 5 && hasArt(g))
    .sort((a, b) => a.id.localeCompare(b.id))

  const heroSource = pickWeekly(topRated, userId, weekIndex())
    // Nothing rated 5/5 with art yet: fall back to the most-played game that has
    // some, then to any game at all, so the banner is never empty for the sake
    // of it.
    ?? completedWithHours.find(hasArt)
    // Not ambient: the banner should be a game they picked, not whatever the
    // agent happened to catch them running.
    ?? games.find(g => g.status !== 'ambient' && hasArt(g))
    ?? null
  const heroGame = heroSource
    ? {
        id: heroSource.id,
        title: heroSource.title,
        artwork_url: heroSource.artwork_url,
        cover_image_url: heroSource.cover_image_url,
        rawg_id: heroSource.rawg_id,
        igdb_id: heroSource.igdb_id,
      }
    : null

  const monthCounts: Record<string, number> = {}
  for (const g of completedGames) {
    if (!g.completion_date) continue
    const d = new Date(g.completion_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthCounts[key] = (monthCounts[key] ?? 0) + 1
  }
  const topMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0] ?? null
  const mostProlificMonth = topMonth
    ? { label: new Date(topMonth[0] + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), count: topMonth[1] }
    : null

  const transactions = ticketsRes.data ?? []
  const ticketsEarned = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const ticketsSpent  = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  // Charts
  const gamesByYear: Record<string, { title: string; image_url: string | null }[]> = {}
  const genreCounts: Record<string, number> = {}
  const platformCounts: Record<string, number> = {}
  const platformDisplayNames: Record<string, string> = {}

  for (const g of games) {
    // Neither says anything about taste: a backlog game has not been played,
    // and an ambient one arrived automatically rather than being chosen.
    if (g.status === 'backlog' || g.status === 'ambient') continue
    if (g.status === 'completed' && g.completion_date) {
      const year = new Date(g.completion_date).getFullYear().toString()
      if (!gamesByYear[year]) gamesByYear[year] = []
      gamesByYear[year].push({ title: g.title, image_url: g.image_url })
    }
    for (const genre of g.genres ?? []) {
      genreCounts[genre] = (genreCounts[genre] ?? 0) + 1
    }
    if (g.platform) {
      const key = g.platform.trim().toLowerCase()
      if (!platformCounts[key]) {
        platformDisplayNames[key] = g.platform.trim()
        platformCounts[key] = 0
      }
      platformCounts[key]++
    }
  }

  const gamesPerYear = Object.entries(gamesByYear)
    .map(([year, gs]) => ({ year, count: gs.length, games: gs }))
    .sort((a, b) => a.year.localeCompare(b.year))

  const genreData = Object.entries(genreCounts)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const platformData = Object.entries(platformCounts)
    .map(([key, count]) => ({ platform: platformDisplayNames[key] ?? key, count }))
    .sort((a, b) => b.count - a.count)

  return {
    profile: profile ?? { id: userId, display_name: null, username: '', accent_colour: null, ticket_balance: 0, xp: 0, created_at: null },
    completedCount: completedGames.length,
    dnfCount: dnfGames.length,
    backlogCount: backlogGames.length,
    playingCount: playingGames.length,
    ambientCount: ambientGames.length,
    totalHours,
    completionRate,
    avgRating,
    perfectedCount,
    longestGame,
    shortestGame,
    mostProlificMonth,
    ticketsEarned,
    ticketsSpent,
    dnfRate,
    achievementsUnlocked: (achievementsRes.data ?? []).length,
    heroGame,
    genreData,
    platformData,
    gamesPerYear,
  }
}
