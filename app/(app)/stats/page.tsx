import { createClient } from '@/lib/supabase/server'
import { ACHIEVEMENTS, levelProgress } from '@/lib/achievements'
import { computeUserStats, type UserStats } from '@/lib/user-stats'
import GamesPerYearChart from '@/components/dashboard/GamesPerYearChart'
import GenreAndPlatformCharts from '@/components/dashboard/GenreAndPlatformCharts'
import FriendPicker from '@/components/stats/FriendPicker'

// ── Comparison helpers ─────────────────────────────────────────────────────────

type Direction = 'higher' | 'lower'
type WinResult = 'me' | 'friend' | 'tie' | 'none'

function winner(myVal: number | null, friendVal: number | null, direction: Direction): WinResult {
  if (myVal == null || friendVal == null) return 'none'
  if (myVal === friendVal) return 'tie'
  if (direction === 'higher') return myVal > friendVal ? 'me' : 'friend'
  return myVal < friendVal ? 'me' : 'friend'
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function fmt(val: number | null, suffix = ''): string {
  if (val == null) return '—'
  return `${val}${suffix}`
}

function fmtHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-5 space-y-4">
      <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">{title}</p>
      {children}
    </div>
  )
}

function StatRow({
  label,
  value,
  isWinner,
}: {
  label: string
  value: string
  isWinner: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="flex items-center gap-1">
        {isWinner && <span className="text-[10px] text-fg-subtle">▲</span>}
        <span className={`text-sm ${isWinner ? 'font-semibold text-fg-base' : 'font-medium text-fg-secondary'}`}>{value}</span>
      </span>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-sunken rounded-lg p-3 space-y-0.5">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="text-lg font-bold text-fg-base">{value}</p>
    </div>
  )
}

function HighlightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-medium text-fg-muted uppercase tracking-wider shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-fg-base text-right">{value}</span>
    </div>
  )
}

function ColumnHeader({ stats }: { stats: UserStats }) {
  const accent = stats.profile.accent_colour ?? '#7c3aed'
  const name = stats.profile.display_name ?? stats.profile.username
  return (
    <div
      className="px-4 py-3 rounded-xl border border-edge-base"
      style={{
        borderLeftWidth: '4px',
        borderLeftColor: accent,
        background: `linear-gradient(to right, ${accent}22, transparent)`,
      }}
    >
      <p className="font-semibold text-fg-base text-sm">{name}</p>
      <p className="text-xs text-fg-muted">@{stats.profile.username}</p>
    </div>
  )
}

// ── Stats column ───────────────────────────────────────────────────────────────

function StatsColumn({
  stats,
  wins,
  accent,
  showCharts,
  side,
}: {
  stats: UserStats
  wins: Record<string, WinResult>
  accent: string | null
  showCharts: boolean
  side: 'me' | 'friend'
}) {
  const isWin = (key: string) => wins[key] === side

  const { level, percent } = levelProgress(stats.profile.xp)

  return (
    <div className="space-y-4">
      {/* Overview */}
      <SectionCard title="Overview">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Completed" value={String(stats.completedCount)} />
          <MiniStat label="DNF" value={String(stats.dnfCount)} />
          <MiniStat label="Backlog" value={String(stats.backlogCount)} />
          <MiniStat label="Playing" value={String(stats.playingCount)} />
        </div>
        <div className="space-y-2 pt-1">
          <StatRow label="Total hours" value={fmtHours(stats.totalHours)} isWinner={isWin('totalHours')} />
          <StatRow label="Completion rate" value={fmt(stats.completionRate, '%')} isWinner={isWin('completionRate')} />
          <StatRow label="Average rating" value={stats.avgRating != null ? `${stats.avgRating}/5` : '—'} isWinner={isWin('avgRating')} />
        </div>
      </SectionCard>

      {/* Completion highlights */}
      <SectionCard title="Completion Highlights">
        <div className="space-y-3">
          <HighlightRow label="Longest" value={stats.longestGame ? `${stats.longestGame.title} · ${fmtHours(stats.longestGame.hours_played)}` : '—'} />
          <HighlightRow label="Shortest" value={stats.shortestGame ? `${stats.shortestGame.title} · ${fmtHours(stats.shortestGame.hours_played)}` : '—'} />
          <HighlightRow label="Best month" value={stats.mostProlificMonth ? `${stats.mostProlificMonth.label} · ${stats.mostProlificMonth.count} game${stats.mostProlificMonth.count !== 1 ? 's' : ''}` : '—'} />
        </div>
      </SectionCard>

      {/* Tickets */}
      <SectionCard title="Tickets">
        <div className="space-y-2">
          <StatRow label="Earned" value={`+${stats.ticketsEarned}`} isWinner={isWin('ticketsEarned')} />
          <StatRow label="Spent" value={`${stats.ticketsSpent}`} isWinner={isWin('ticketsSpent')} />
          <StatRow label="Current balance" value={String(stats.profile.ticket_balance)} isWinner={isWin('ticketBalance')} />
          <StatRow label="DNF rate" value={fmt(stats.dnfRate, '%')} isWinner={isWin('dnfRate')} />
        </div>
      </SectionCard>

      {/* Achievements */}
      <SectionCard title="Achievements">
        <div className="space-y-2">
          <StatRow
            label="Unlocked"
            value={`${stats.achievementsUnlocked} / ${ACHIEVEMENTS.length}`}
            isWinner={isWin('achievementsUnlocked')}
          />
          <StatRow label="Total XP" value={stats.profile.xp.toLocaleString()} isWinner={isWin('xp')} />
          <StatRow label="Level" value={String(level)} isWinner={false} />
        </div>
        {/* XP progress bar */}
        <div className="space-y-1">
          <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%`, background: `linear-gradient(to right, ${(stats.profile.accent_colour ?? '#7c3aed')}99, ${stats.profile.accent_colour ?? '#7c3aed'})` }}
            />
          </div>
          <p className="text-xs text-fg-subtle">{percent}% to level {level + 1}</p>
        </div>
      </SectionCard>

      {/* Charts */}
      {showCharts && (
        <SectionCard title="Charts">
          {stats.gamesPerYear.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted mb-2">Games per year</p>
              <GamesPerYearChart data={stats.gamesPerYear} accentColor={accent} />
            </div>
          )}
          <GenreAndPlatformCharts genreData={stats.genreData} platformData={stats.platformData} accentColor={accent} />
        </SectionCard>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { compare?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .neq('id', user!.id)
    .order('display_name', { ascending: true, nullsFirst: false }) as { data: { id: string; display_name: string | null; username: string }[] | null }

  const friends = allProfiles ?? []

  const compareUsername = searchParams.compare?.trim() || friends[0]?.username || null

  let myStats: UserStats
  let friendStats: UserStats | null = null

  if (compareUsername) {
    const { data: friendProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', compareUsername)
      .single() as { data: { id: string } | null }

    if (friendProfile) {
      ;[myStats, friendStats] = await Promise.all([
        computeUserStats(supabase, user!.id),
        computeUserStats(supabase, friendProfile.id),
      ])
    } else {
      myStats = await computeUserStats(supabase, user!.id)
    }
  } else {
    myStats = await computeUserStats(supabase, user!.id)
  }

  // Compute winners for each numeric stat
  const wins: Record<string, WinResult> = friendStats ? {
    completedCount:        winner(myStats.completedCount,        friendStats.completedCount,        'higher'),
    totalHours:            winner(myStats.totalHours,            friendStats.totalHours,            'higher'),
    completionRate:        winner(myStats.completionRate,        friendStats.completionRate,        'higher'),
    avgRating:             winner(myStats.avgRating,             friendStats.avgRating,             'higher'),
    ticketsEarned:         winner(myStats.ticketsEarned,         friendStats.ticketsEarned,         'higher'),
    ticketsSpent:          winner(myStats.ticketsSpent,          friendStats.ticketsSpent,          'lower'),
    ticketBalance:         winner(myStats.profile.ticket_balance, friendStats.profile.ticket_balance, 'higher'),
    dnfRate:               winner(myStats.dnfRate,               friendStats.dnfRate,               'lower'),
    achievementsUnlocked:  winner(myStats.achievementsUnlocked,  friendStats.achievementsUnlocked,  'higher'),
    xp:                    winner(myStats.profile.xp,            friendStats.profile.xp,            'higher'),
  } : {}

  const myAccent     = myStats.profile.accent_colour
  const friendAccent = friendStats?.profile.accent_colour ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-fg-base">Stats</h1>
        {friends.length > 0 ? (
          <FriendPicker friends={friends} currentCompare={compareUsername} />
        ) : (
          <span className="text-xs text-fg-subtle">No other users to compare with</span>
        )}
      </div>

      {friendStats ? (
        /* ── Comparison layout ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <ColumnHeader stats={myStats} />
            <StatsColumn stats={myStats} wins={wins} accent={myAccent} showCharts={true} side="me" />
          </div>
          <div className="space-y-4">
            <ColumnHeader stats={friendStats} />
            <StatsColumn stats={friendStats} wins={wins} accent={friendAccent} showCharts={true} side="friend" />
          </div>
        </div>
      ) : (
        /* ── Single-user layout ── */
        <div className="max-w-2xl space-y-4">
          <StatsColumn stats={myStats} wins={{}} accent={myAccent} showCharts={true} side="me" />
        </div>
      )}
    </div>
  )
}
