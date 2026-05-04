import { createClient } from '@/lib/supabase/server'
import type { Profile, Game } from '@/lib/types'
import Link from 'next/link'
import StatusBadge from '@/components/games/StatusBadge'
import GamesPerYearChart from '@/components/dashboard/GamesPerYearChart'
import GenreAndPlatformCharts from '@/components/dashboard/GenreAndPlatformCharts'
import { GREETINGS } from '@/lib/greetings'


export default async function DashboardPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

  const { data: allGames } = await supabase
    .from('games')
    .select('hours_played, status, completion_date, created_at, title, image_url, genres, platform')
    .eq('user_id', user!.id) as { data: { hours_played: number | null; status: string; completion_date: string | null; created_at: string; title: string; image_url: string | null; genres: string[] | null; platform: string | null }[] | null; error: unknown }

  const totalHours = allGames?.reduce((sum, g) => sum + (g.hours_played ?? 0), 0) ?? 0

  const completedCount = allGames?.filter(g => g.status === 'completed').length ?? 0
  const startedCount = allGames?.filter(g => g.status !== 'backlog').length ?? 0
  const completionRate = startedCount > 0 ? Math.round((completedCount / startedCount) * 100) : null

  const gamesByYear: Record<string, { title: string; image_url: string | null }[]> = {}
  const genreCounts: Record<string, number> = {}
  const platformCounts: Record<string, number> = {}
  const platformDisplayNames: Record<string, string> = {}

  for (const g of allGames ?? []) {
    if (g.status === 'backlog') continue

    // Bar chart — completed only
    if (g.status === 'completed' && g.completion_date) {
      const year = new Date(g.completion_date).getFullYear().toString()
      if (!gamesByYear[year]) gamesByYear[year] = []
      gamesByYear[year].push({ title: g.title, image_url: g.image_url })
    }

    // Radar — genre counts
    for (const genre of g.genres ?? []) {
      genreCounts[genre] = (genreCounts[genre] ?? 0) + 1
    }

    // Pie — platform counts (use lowercase key to merge casing variants like
    // "XBOX 360" and "Xbox 360", but track original name for display/colour lookup)
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
    .map(([year, games]) => ({ year, count: games.length, games }))
    .sort((a, b) => a.year.localeCompare(b.year))

  const genreData = Object.entries(genreCounts)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const platformData = Object.entries(platformCounts)
    .map(([key, count]) => ({ platform: platformDisplayNames[key] ?? key, count }))
    .sort((a, b) => b.count - a.count)

  const { data: ticketEarnings } = await supabase
    .from('ticket_transactions')
    .select('amount')
    .eq('user_id', user!.id)
    .gt('amount', 0) as { data: { amount: number }[] | null }

  const totalTicketsEarned = ticketEarnings?.reduce((sum, t) => sum + t.amount, 0) ?? 0

  const { data: recentGamesRaw } = await supabase
    .from('games')
    .select('id, title, status, hours_played, achievement_progress, rating, completion_date, completion_date_precision, created_at')
    .eq('user_id', user!.id)
    .in('status', ['playing', 'completed', 'dnf'])
    .order('created_at', { ascending: false })
    .limit(20) as { data: Game[] | null; error: unknown }

  const recentGames = recentGamesRaw ?? []

  // Sum ticket transactions per game for the recent activity table
  const recentGameIds = recentGames.map(g => g.id)
  const { data: ticketRows } = recentGameIds.length > 0
    ? await supabase
        .from('ticket_transactions')
        .select('game_id, amount')
        .eq('user_id', user!.id)
        .in('game_id', recentGameIds)
    : { data: [] as { game_id: string; amount: number }[] }

  const ticketsByGame = (ticketRows ?? []).reduce<Record<string, number>>((acc, row) => {
    if (!row.game_id) return acc
    acc[row.game_id] = (acc[row.game_id] ?? 0) + row.amount
    return acc
  }, {})

  const { data: friendProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, username, ticket_balance')
    .neq('id', user!.id)
    .order('display_name', { ascending: true, nullsFirst: false }) as { data: Profile[] | null }

  const { data: friendGameCounts } = await supabase
    .from('games')
    .select('user_id, status') as { data: { user_id: string; status: string }[] | null }

  const friendCountsByUser = (friendGameCounts ?? []).reduce<Record<string, { completed: number; playing: number }>>((acc, g) => {
    if (!acc[g.user_id]) acc[g.user_id] = { completed: 0, playing: 0 }
    if (g.status === 'completed') acc[g.user_id].completed++
    if (g.status === 'playing') acc[g.user_id].playing++
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">
          {greeting}, {profile?.display_name ?? profile?.username}
        </h1>
        <p className="mt-1 text-fg-muted text-sm">Here&apos;s your GamesList overview.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Tickets Earned" value={`🎟️ ${totalTicketsEarned}`} href="/tickets" linkLabel="View history" />
        <StatCard
          label="Current Turn"
          value={formatTurn(profile?.wheel_turn ?? 'spin')}
        />
        <StatCard label="Games" value={String(allGames?.length ?? 0)} href="/games" linkLabel="View list" />
        <StatCard label="Total Hours" value={`${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`} />
        <StatCard
          label="Completion Rate"
          value={completionRate !== null ? `${completionRate}%` : '—'}
          sub={completionRate !== null ? `${completedCount} of ${startedCount} started` : 'No games started yet'}
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <QuickAction href="/games/new" label="Add a Game" icon="+" />
          <QuickAction href="/wheel" label="Spin the Wheel" icon="🎡" />
          <QuickAction href="/tickets" label="Ticket History" icon="🎟️" />
        </div>
      </div>

      {/* Friends */}
      {(friendProfiles ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
            Friends <span className="font-normal normal-case text-fg-subtle ml-1">({friendProfiles!.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(friendProfiles ?? []).map(profile => {
              const counts = friendCountsByUser[profile.id] ?? { completed: 0, playing: 0 }
              const initials = (profile.display_name ?? profile.username)
                .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
              return (
                <Link
                  key={profile.id}
                  href={`/users/${encodeURIComponent(profile.username)}`}
                  className="flex items-center gap-3 bg-surface-base border border-edge-base rounded-xl p-3 hover:border-brand-300 hover:shadow-sm transition-all dark:hover:border-brand-700"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0 dark:bg-brand-900/40 dark:text-brand-300">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-fg-base truncate">{profile.display_name ?? profile.username}</p>
                    <p className="text-xs text-fg-subtle truncate">@{profile.username}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-fg-muted">
                      <span>{counts.completed} completed</span>
                      {counts.playing > 0 && (
                        <span className="text-brand-600 dark:text-brand-400">{counts.playing} playing</span>
                      )}
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300">
                    🎟️ {profile.ticket_balance}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent games table */}
      {recentGames.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
            Recent Activity
          </h2>

          <div className="w-full bg-surface-base border border-edge-base rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-subtle bg-surface-sunken">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden md:table-cell whitespace-nowrap">Hours</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden md:table-cell">Achievements</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden md:table-cell whitespace-nowrap">Rating</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden md:table-cell whitespace-nowrap">Tickets</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden lg:table-cell whitespace-nowrap">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {recentGames.map(game => (
                  <tr key={game.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/games/${game.id}`}
                        className="font-medium text-fg-base hover:text-brand-600 transition-colors dark:hover:text-brand-400"
                      >
                        {game.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={game.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-fg-secondary hidden md:table-cell">
                      {game.hours_played != null ? `${game.hours_played}h` : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {game.achievement_progress != null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-fg-secondary text-xs">{Math.round(game.achievement_progress)}%</span>
                          <div className="w-32 h-1.5 bg-surface-active rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colorGradient(Math.round(game.achievement_progress))}`}
                              style={{ width: `${game.achievement_progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-right"><span className="text-fg-subtle">—</span></div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {game.rating != null ? (
                        <span className="text-fg-secondary">{game.rating}<span className="text-fg-muted">/5</span></span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-medium tabular-nums">
                      {ticketsByGame[game.id] != null ? (
                        <span className={ticketsByGame[game.id] > 0 ? 'text-emerald-600' : 'text-red-500'}>
                          {ticketsByGame[game.id] > 0 ? '+' : ''}{ticketsByGame[game.id]}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-fg-muted hidden lg:table-cell">
                      {game.completion_date
                        ? (game.completion_date_precision === 'year'
                            ? game.completion_date.slice(0, 4)
                            : new Date(game.completion_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
                        : <span className="text-fg-subtle">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      <GamesPerYearChart data={gamesPerYear} />
      <GenreAndPlatformCharts genreData={genreData} platformData={platformData} />
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  href,
  linkLabel,
}: {
  label: string
  value: string
  sub?: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4">
      <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-xl font-bold text-fg-base">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
      {href && linkLabel && (
        <Link href={href} className="mt-2 text-xs text-brand-600 hover:text-brand-800 transition-colors">
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 bg-surface-base border border-edge-base rounded-xl px-4 py-3 text-sm font-medium text-fg-secondary hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition-colors dark:hover:bg-brand-900/30 dark:hover:border-brand-700 dark:hover:text-brand-300"
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  )
}

function colorGradient(pct: number): string {
  if (pct === 100) return 'bg-gradient-to-r from-emerald-400 to-teal-500'
  if (pct >= 75)   return 'bg-gradient-to-r from-green-400 to-emerald-500'
  if (pct >= 50)   return 'bg-gradient-to-r from-amber-400 to-orange-400'
  if (pct >= 20)   return 'bg-gradient-to-r from-orange-400 to-red-400'
  return                  'bg-gradient-to-r from-red-500 to-rose-600'
}

function formatTurn(turn: string): string {
  const map: Record<string, string> = {
    spin: 'Spin',
    spin_reroll: 'Spin + Reroll',
    choose: 'Choose Game',
  }
  return map[turn] ?? turn
}
