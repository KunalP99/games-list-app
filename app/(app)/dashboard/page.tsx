import { createClient } from '@/lib/supabase/server'
import type { Profile, Game } from '@/lib/types'
import Link from 'next/link'
import StatusBadge from '@/components/games/StatusBadge'

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

  const { data: allGames } = await supabase
    .from('games')
    .select('hours_played')
    .eq('user_id', user!.id) as { data: { hours_played: number | null }[] | null; error: unknown }

  const totalHours = allGames?.reduce((sum, g) => sum + (g.hours_played ?? 0), 0) ?? 0

  const { data: playingGames } = await supabase
    .from('games')
    .select('id, title, status, hours_played, achievement_progress, rating, completion_date')
    .eq('user_id', user!.id)
    .eq('status', 'playing')
    .order('created_at', { ascending: false }) as { data: Game[] | null; error: unknown }

  const { data: completedGames } = await supabase
    .from('games')
    .select('id, title, status, hours_played, achievement_progress, rating, completion_date')
    .eq('user_id', user!.id)
    .eq('status', 'completed')
    .order('completion_date', { ascending: false, nullsFirst: false })
    .limit(10) as { data: Game[] | null; error: unknown }

  const recentGames = [...(playingGames ?? []), ...(completedGames ?? [])]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">
          Welcome back, {profile?.display_name ?? profile?.username}
        </h1>
        <p className="mt-1 text-zinc-500 text-sm">Here&apos;s your GamesList overview.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Ticket Balance" value={`🎟️ ${profile?.ticket_balance ?? 0}`} />
        <StatCard
          label="Current Turn"
          value={formatTurn(profile?.wheel_turn ?? 'spin')}
        />
        <StatCard label="Games" value="—" href="/games" linkLabel="View list" />
        <StatCard label="Total Hours" value={`${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`} />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <QuickAction href="/games/new" label="Add a Game" icon="+" />
          <QuickAction href="/wheel" label="Spin the Wheel" icon="🎡" />
          <QuickAction href="/tickets" label="Ticket History" icon="🎟️" />
        </div>
      </div>

      {/* Recent games table */}
      {recentGames.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Recent Activity
          </h2>
          <div className="w-full bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Hours</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Achievements</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Rating</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden lg:table-cell">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentGames.map(game => (
                  <tr key={game.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/games/${game.id}`}
                        className="font-medium text-zinc-900 hover:text-violet-600 transition-colors"
                      >
                        {game.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={game.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 hidden md:table-cell">
                      {game.hours_played != null ? `${game.hours_played}h` : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {game.achievement_progress != null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-zinc-600 text-xs">{Math.round(game.achievement_progress)}%</span>
                          <div className="w-20 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colorGradient(Math.round(game.achievement_progress))}`}
                              style={{ width: `${game.achievement_progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-right"><span className="text-zinc-300">—</span></div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {game.rating != null ? (
                        <span className="text-zinc-600">{game.rating}<span className="text-zinc-400">/10</span></span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500 hidden lg:table-cell">
                      {game.completion_date
                        ? new Date(game.completion_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : <span className="text-zinc-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  href,
  linkLabel,
}: {
  label: string
  value: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900">{value}</p>
      {href && linkLabel && (
        <Link href={href} className="mt-2 text-xs text-violet-600 hover:text-violet-800 transition-colors">
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
      className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors"
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
