import type { createClient } from '@/lib/supabase/server'
import type { UserStats } from '@/lib/user-stats'
import { fetchAllRows } from '@/lib/data/fetch-all'
import { getLiveSessions } from '@/lib/presence'
import { londonDay } from '@/lib/activity'
import { playSummary, MAX_PLAY_PERIOD_DAYS } from '@/lib/dashboard'
import { streaks } from '@/lib/stats-wrapped'
import { AVAILABLE_ACHIEVEMENTS } from '@/lib/achievements'
import type { CardGame, ProfileCardData, ProfileCardId } from '@/lib/profile-cards'

type Supabase = Awaited<ReturnType<typeof createClient>>

type GameRow = {
  id: string
  title: string
  image_url: string | null
  artwork_url: string | null
  cover_image_url: string | null
  hours_played: number | null
  completion_date?: string | null
}

const GAME_COLUMNS = 'id, title, image_url, artwork_url, cover_image_url, hours_played'

function toCardGame(g: GameRow): CardGame {
  return {
    id: g.id,
    title: g.title,
    wide: g.artwork_url ?? g.image_url ?? g.cover_image_url,
    cover: g.cover_image_url ?? g.image_url ?? g.artwork_url,
    hours: g.hours_played,
  }
}

/**
 * What the given cards show for one person. Only the cards asked for are
 * loaded: a visitor gets the cards on the layout that they may see, the owner
 * every card (so one added in edit mode shows straight away). Reads go
 * through the viewer's own client, so the database's privacy rules apply too.
 */
export async function loadProfileCardData(
  supabase: Supabase,
  userId: string,
  cards: ReadonlySet<ProfileCardId>,
  stats: UserStats,
): Promise<ProfileCardData> {
  const data: ProfileCardData = {}
  const wants = (card: ProfileCardId) => cards.has(card)
  const needSessions = wants('year') || wants('streak')

  const today = londonDay(new Date().toISOString())
  const year = Number(today.slice(0, 4))

  const [playingRes, live, completedRes, backlogRes, sessions, thisYearRes] = await Promise.all([
    wants('playing')
      ? supabase.from('games').select(GAME_COLUMNS).eq('user_id', userId).eq('status', 'playing')
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(6) as unknown as Promise<{ data: GameRow[] | null }>
      : Promise.resolve({ data: null }),
    wants('playing') ? getLiveSessions(supabase, [userId]) : Promise.resolve(new Map<string, string>()),
    wants('recently_completed')
      ? supabase.from('games').select(`${GAME_COLUMNS}, completion_date`).eq('user_id', userId).eq('status', 'completed')
        .order('completion_date', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(3) as unknown as Promise<{ data: GameRow[] | null }>
      : Promise.resolve({ data: null }),
    wants('up_next')
      ? supabase.from('games').select(GAME_COLUMNS).eq('user_id', userId).eq('status', 'backlog')
        .order('created_at', { ascending: false })
        .limit(3) as unknown as Promise<{ data: GameRow[] | null }>
      : Promise.resolve({ data: null }),
    needSessions
      // Paged: a year of sessions can pass PostgREST's 1,000-row cap.
      ? fetchAllRows<{ game_id: string | null; started_at: string; minutes: number | null }>(() => supabase
        .from('play_sessions')
        .select('game_id, started_at, minutes')
        .eq('user_id', userId)
        .gte('started_at', new Date(Date.now() - MAX_PLAY_PERIOD_DAYS * 86_400_000).toISOString())
        .order('started_at', { ascending: false })
        .order('id'))
      : Promise.resolve([]),
    wants('completed_this_year')
      ? supabase.from('games').select('completion_date').eq('user_id', userId).eq('status', 'completed')
        .gte('completion_date', `${year}-01-01`) as unknown as Promise<{ data: { completion_date: string | null }[] | null }>
      : Promise.resolve({ data: null }),
  ])

  if (wants('playing')) {
    data.playing = (playingRes.data ?? []).map(g => ({ ...toCardGame(g), liveSince: live.get(g.id) ?? null }))
    // Whatever's running now goes first.
    data.playing.sort((a, b) => Number(Boolean(b.liveSince)) - Number(Boolean(a.liveSince)))
  }
  if (wants('recently_completed')) {
    data.recently_completed = (completedRes.data ?? []).map(g => ({ ...toCardGame(g), completedOn: g.completion_date ?? null }))
  }
  if (wants('up_next')) data.up_next = (backlogRes.data ?? []).map(toCardGame)

  if (wants('year')) {
    const summary = playSummary(sessions, 'year')
    data.year = { bars: summary.bars.map(b => ({ start: b.start, minutes: b.minutes })), totalMinutes: summary.totalMinutes }
  }
  if (wants('streak')) {
    // A session under a minute isn't play, the same rule as the Stats page.
    const days = sessions.filter(s => (s.minutes ?? 0) >= 1).map(s => londonDay(s.started_at))
    const run = streaks(days)
    const played = new Set(days)
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - i) * 86_400_000).toISOString().slice(0, 10)
      return { day, played: played.has(day) }
    })
    data.streak = { current: run?.current ?? 0, best: run?.days ?? 0, week }
  }

  if (wants('finish_rate')) {
    data.finish_rate = { rate: stats.completionRate, completed: stats.completedCount, stopped: stats.completedCount + stats.dnfCount }
  }
  if (wants('achievements')) {
    data.achievements = { unlocked: stats.achievementsUnlocked, xp: stats.profile.xp ?? 0, total: AVAILABLE_ACHIEVEMENTS.length }
  }
  if (wants('genres')) data.genres = stats.genreData.slice(0, 3).map(g => ({ name: g.genre, count: g.count }))
  if (wants('platforms')) data.platforms = stats.platformData.slice(0, 3).map(p => ({ name: p.platform, count: p.count }))
  if (wants('completed_this_year')) {
    const months = Array.from({ length: 12 }, () => 0)
    for (const g of thisYearRes.data ?? []) {
      if (g.completion_date?.startsWith(String(year))) months[Number(g.completion_date.slice(5, 7)) - 1]++
    }
    data.completed_this_year = { year, count: months.reduce((a, b) => a + b, 0), months, month: Number(today.slice(5, 7)) - 1 }
  }
  return data
}
