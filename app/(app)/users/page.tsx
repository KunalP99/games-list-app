import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export default async function UsersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', user!.id)
    .order('display_name', { ascending: true, nullsFirst: false }) as { data: Profile[] | null }

  // Fetch game counts per user in one query
  const { data: gameCounts } = await supabase
    .from('games')
    .select('user_id, status') as { data: { user_id: string; status: string }[] | null }

  const countsByUser = (gameCounts ?? []).reduce<Record<string, { total: number; completed: number; playing: number }>>((acc, g) => {
    if (!acc[g.user_id]) acc[g.user_id] = { total: 0, completed: 0, playing: 0 }
    acc[g.user_id].total++
    if (g.status === 'completed') acc[g.user_id].completed++
    if (g.status === 'playing') acc[g.user_id].playing++
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Friends</h1>
        <p className="text-sm text-fg-muted mt-0.5">{profiles?.length ?? 0} friends</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(profiles ?? []).map(profile => {
          const counts = countsByUser[profile.id] ?? { total: 0, completed: 0, playing: 0 }
          const initials = (profile.display_name ?? profile.username)
            .split(' ')
            .slice(0, 2)
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()

          return (
            <Link
              key={profile.id}
              href={`/users/${encodeURIComponent(profile.username)}`}
              className="flex items-center gap-4 bg-surface-base border border-edge-base rounded-xl p-4 hover:border-brand-300 hover:shadow-sm transition-all dark:hover:border-brand-700"
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0 dark:bg-brand-900/40 dark:text-brand-300">
                {initials}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg-base truncate">
                  {profile.display_name ?? profile.username}
                </p>
                <p className="text-xs text-fg-subtle truncate">@{profile.username}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-fg-muted">
                  <span>{counts.completed} completed</span>
                  {counts.playing > 0 && (
                    <span className="text-brand-600 dark:text-brand-400">{counts.playing} playing</span>
                  )}
                </div>
              </div>

              {/* Ticket balance */}
              <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-1 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300">
                🎟️ {profile.ticket_balance}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
