import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/data/profile'
import { getLiveSessions } from '@/lib/presence'
import { lastPlayedByGame, type SessionRow } from '@/lib/recently-played'
import { londonDay } from '@/lib/activity'
import { pickHero, streakStatus, playSummary, ticketsEarnedThisWeek, MAX_PLAY_PERIOD_DAYS, type PlayPeriod, type PlaySummary } from '@/lib/dashboard'
import { fetchAllRows } from '@/lib/data/fetch-all'
import { GREETINGS } from '@/lib/greetings'
import HeroCard, { type HeroGame } from './HeroCard'
import StreakPill from './StreakPill'
import WheelTurnCard from './WheelTurnCard'
import LevelCard, { LevelCardSkeleton } from './LevelCard'
import FriendsCard, { type FriendSummary } from './FriendsCard'
import PlayCard from './PlayCard'
import ComingUpCard, { ComingUpSkeleton } from './ComingUpCard'
import ActivityCard, { ActivityCardSkeleton } from './ActivityCard'
import { FEATURES, wheelOn } from '@/lib/edition'
import { getFriendsOverview, getPlayingNowFor, type FriendsOverview } from '@/lib/data/friends'

// How far back sessions are loaded: a year (plus a day's slack for the time
// zone), for the "Your year" chart. The streak counts within the same window,
// so a run longer than a year would read as capped at it.
const SESSION_WINDOW_DAYS = MAX_PLAY_PERIOD_DAYS + 1

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' })

type GameRow = HeroGame & { completion_date: string | null }

/**
 * The dashboard (app/(app)/dashboard/page.tsx renders it for everyone).
 *
 * Left: what you played last, four stats, and everyone's activity. Right: your
 * wheel turn, friends (live players pinned on top), your week / month / year in play and
 * what's coming up.
 */
export default async function NewDashboard({ userId }: { userId: string }) {
  const supabase = await createClient()
  // eslint-disable-next-line react-hooks/purity -- server component: runs once per request
  const sessionsFrom = new Date(Date.now() - SESSION_WINDOW_DAYS * 86_400_000).toISOString()

  const [profile, gamesRes, sessions, live, playingNow, weekTicketsRes, friendProfilesRes, overview] = await Promise.all([
    getProfile(userId),
    supabase
      .from('games')
      .select('id, title, status, hours_played, platform, artwork_url, image_url, is_favourite, completion_date')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }) as unknown as Promise<{ data: GameRow[] | null }>,
    // Paged: a year of sessions can pass PostgREST's 1,000-row cap.
    fetchAllRows<SessionRow & { minutes: number | null }>(() => supabase
      .from('play_sessions')
      .select('game_id, started_at, ended_at, last_checkpoint_at, minutes')
      .eq('user_id', userId)
      .gte('started_at', sessionsFrom)
      .order('started_at', { ascending: false })
      .order('id')),
    getLiveSessions(supabase, [userId]),
    getPlayingNowFor(supabase, userId),
    supabase
      .from('ticket_transactions')
      .select('amount, created_at')
      .eq('user_id', userId)
      .gt('amount', 0)
      // 8 days back covers the 7 UK days whatever the time zone offset;
      // ticketsEarnedThisWeek trims to the exact days.
      // eslint-disable-next-line react-hooks/purity -- server component: runs once per request
      .gte('created_at', new Date(Date.now() - 8 * 86_400_000).toISOString()) as unknown as Promise<{ data: { amount: number; created_at: string }[] | null }>,
    // Friends edition: everyone signed up is a friend. Public edition: your
    // friends (lib/data/friends.ts), plus requests waiting for you.
    FEATURES.friendSystem
      ? Promise.resolve({ data: null })
      : supabase
        .from('profiles')
        .select('id, display_name, username, accent_colour')
        .neq('id', userId)
        .order('display_name', { ascending: true, nullsFirst: false }) as unknown as Promise<{ data: { id: string; display_name: string | null; username: string; accent_colour: string | null }[] | null }>,
    FEATURES.friendSystem ? getFriendsOverview(supabase, userId) : Promise.resolve<FriendsOverview | null>(null),
  ])

  const games = gamesRes.data ?? []
  const friendProfiles = overview
    ? overview.friends.map(f => ({ id: f.id, display_name: f.displayName, username: f.username, accent_colour: f.accentColour }))
    : friendProfilesRes.data ?? []

  // Hero: the most recently played Playing or Ambient game (a year of
  // sessions is plenty to tell which).
  const hero = pickHero<HeroGame>({
    playing: games.filter(g => g.status === 'playing'),
    ambient: games.filter(g => g.status === 'ambient'),
    live,
    lastPlayed: lastPlayedByGame(sessions),
  })

  const streak = streakStatus(sessions.map(s => londonDay(s.started_at)))
  const playSummaries = {
    week: playSummary(sessions, 'week'),
    month: playSummary(sessions, 'month'),
    year: playSummary(sessions, 'year'),
  } satisfies Record<PlayPeriod, PlaySummary>
  // Only the three "most played" titles go to the client, not the whole library.
  const playTitles: Record<string, string> = {}
  for (const sum of Object.values(playSummaries)) {
    const g = sum.topGameId ? games.find(x => x.id === sum.topGameId) : undefined
    if (g) playTitles[g.id] = g.title
  }

  // Stats. Ambient hours count (they were played); the Games count doesn't
  // include Ambient, matching the Games tab.
  const curated = games.filter(g => g.status !== 'ambient')
  const totalHours = games.reduce((sum, g) => sum + (g.hours_played ?? 0), 0)
  const completed = games.filter(g => g.status === 'completed').length
  const started = games.filter(g => g.status === 'completed' || g.status === 'dnf').length
  const finishRate = started > 0 ? Math.round((completed / started) * 100) : null

  // "+4 this week": tickets gained over the same 7 days as "Your week".
  const weekTickets = ticketsEarnedThisWeek(weekTicketsRes.data ?? [])

  // Friends: who's on what, for the card's quiet rows.
  const friendIds = friendProfiles.map(f => f.id)
  const { data: friendGames } = friendIds.length > 0
    ? await (supabase.from('games').select('user_id, status').in('user_id', friendIds) as unknown as Promise<{ data: { user_id: string; status: string }[] | null }>)
    : { data: [] as { user_id: string; status: string }[] }
  const counts = new Map<string, { completed: number; playing: number }>()
  for (const g of friendGames ?? []) {
    const c = counts.get(g.user_id) ?? { completed: 0, playing: 0 }
    if (g.status === 'completed') c.completed++
    if (g.status === 'playing') c.playing++
    counts.set(g.user_id, c)
  }
  const friends: FriendSummary[] = friendProfiles.map(f => ({
    id: f.id,
    displayName: f.display_name ?? f.username,
    username: f.username,
    accentColour: f.accent_colour,
    ...(counts.get(f.id) ?? { completed: 0, playing: 0 }),
  }))

  const wheelEnabled = wheelOn(profile)
  // eslint-disable-next-line react-hooks/purity -- server component: a fresh greeting per page load is the point
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
  const name = profile?.display_name ?? profile?.username ?? ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-sm text-fg-muted">{dateFormat.format(new Date())}</p>
            <StreakPill streak={streak} />
          </div>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-bold tracking-tight text-fg-base">{greeting}, {name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/games/new" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            Add a game
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Main column */}
        <div className="flex-[999_1_640px] min-w-0 space-y-4">
          <HeroCard hero={hero} wheelEnabled={wheelEnabled} />

          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            <Stat label="Games" value={String(curated.length)} href="/games" />
            <Stat label="Hours played" value={`${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`} />
            <Stat label="Finish rate" value={finishRate != null ? `${finishRate}%` : '—'} sub={started > 0 ? `${completed} of ${started}` : undefined} />
            <Stat
              label="Tickets"
              value={String(profile?.ticket_balance ?? 0)}
              sub={weekTickets > 0 ? `+${weekTickets} this week` : undefined}
              subClass="text-emerald-600 dark:text-emerald-400"
              href="/tickets"
            />
          </div>

          <Suspense fallback={<ActivityCardSkeleton />}>
            <ActivityCard userId={userId} />
          </Suspense>
        </div>

        {/* Right rail — below the main column on narrow screens */}
        <div className="flex-[1_1_300px] min-w-0 space-y-4">
          {wheelEnabled && (
            <WheelTurnCard turn={profile?.wheel_turn ?? 'spin'} inProgress={profile?.wheel_session != null} />
          )}
          {/* No wheel in this edition: your level and next achievement take its
              place, in the same bold card (lib/edition.ts). */}
          {!FEATURES.wheel && (
            <Suspense fallback={<LevelCardSkeleton />}>
              <LevelCard userId={userId} xp={profile?.xp ?? 0} />
            </Suspense>
          )}
          <FriendsCard
            friends={friends}
            initialLive={playingNow}
            friendSystem={FEATURES.friendSystem}
            incoming={overview?.incoming ?? []}
          />
          {playSummaries.year.totalMinutes > 0 && <PlayCard summaries={playSummaries} titles={playTitles} />}
          <Suspense fallback={<ComingUpSkeleton />}>
            <ComingUpCard userId={userId} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, subClass = 'text-fg-muted', href }: { label: string; value: string; sub?: string; subClass?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-2 flex items-baseline">
        <span className="font-display text-[28px] leading-[0.9] text-fg-base">{value}</span>
        {sub && <span className={`ml-1.5 text-xs font-semibold ${subClass}`}>{sub}</span>}
      </p>
    </>
  )
  const cls = 'block rounded-xl bg-surface-base border border-edge-base p-4'
  return href
    ? <Link href={href} className={`${cls} hover:border-brand-300 dark:hover:border-brand-700 transition-colors`}>{body}</Link>
    : <div className={cls}>{body}</div>
}
