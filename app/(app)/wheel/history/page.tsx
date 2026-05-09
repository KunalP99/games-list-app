import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { SPIN_TYPE_BADGE, SPIN_TYPE_LABEL, inferCost, spinModeLabel, type SpinType, type SpinMode } from '@/lib/wheel-history'
import { TICKET_AWARDS } from '@/lib/constants'
import { getInitials } from '@/lib/activity'

const PAGE_SIZE = 20

type RawSpin = {
  id: string
  user_id: string
  spin_type: SpinType
  spin_mode: SpinMode
  result_name: string | null
  option_a_name: string | null
  option_b_name: string | null
  games_list: string[] | null
  tickets_spent: number | null
  created_at: string
  profiles: {
    id: string
    username: string
    display_name: string | null
    accent_colour: string | null
  } | null
}

export default async function WheelHistoryPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: spins } = await (supabase
    .from('wheel_spins')
    .select('*, profiles(id, username, display_name, accent_colour)')
    .order('created_at', { ascending: false }) as any) as { data: RawSpin[] | null }

  const allSpins = spins ?? []

  // For each spin, detect if the previous spin by the same user was a choose_skip
  const sorted = [...allSpins].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const skippedBefore = new Set<string>()
  const lastTypeByUser = new Map<string, SpinType>()
  for (const spin of sorted) {
    if (spin.spin_type === 'spin' && lastTypeByUser.get(spin.user_id) === 'choose_skip') {
      skippedBefore.add(spin.id)
    }
    lastTypeByUser.set(spin.user_id, spin.spin_type)
  }

  const all = allSpins.filter(s => s.spin_type !== 'choose_skip')
  const page = Math.max(1, Number(searchParams.page ?? 1))
  const totalPages = Math.ceil(all.length / PAGE_SIZE)
  const pageSpins = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Wheel History</h1>
        <p className="text-sm text-fg-muted mt-0.5">{allSpins.length} spin{allSpins.length !== 1 ? 's' : ''} across all players</p>
      </div>

      {pageSpins.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pageSpins.map(spin => {
              const isCurrentUser = spin.user_id === user!.id
              const displayName = isCurrentUser
                ? 'You'
                : (spin.profiles?.display_name ?? spin.profiles?.username ?? 'Unknown')
              const accentColour = spin.profiles?.accent_colour ?? '#7c3aed'
              const initials = getInitials(spin.profiles?.display_name ?? spin.profiles?.username ?? '?')
              const badge = SPIN_TYPE_BADGE[spin.spin_type]
              const label = SPIN_TYPE_LABEL[spin.spin_type]
              const cost = inferCost(spin.spin_type, spin.tickets_spent)
              const modeLabel = spinModeLabel(spin.spin_mode)
              const otherGames = spin.games_list
                ? spin.games_list.filter(g => g.toLowerCase() !== (spin.result_name ?? '').toLowerCase())
                : [spin.option_a_name, spin.option_b_name].filter(Boolean) as string[]

              return (
                <div
                  key={spin.id}
                  className="bg-surface-base border border-edge-base rounded-xl overflow-hidden flex flex-col"
                  style={isCurrentUser ? { borderColor: `${accentColour}60` } : undefined}
                >
                  {/* Card header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle"
                    style={isCurrentUser ? { backgroundColor: `${accentColour}10` } : undefined}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: accentColour }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg-base truncate">{displayName}</p>
                        <p className="text-[11px] text-fg-subtle">
                          {new Date(spin.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {badge && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${badge.className}`}>
                          {label}
                        </span>
                      )}
                      {modeLabel && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-surface-active text-fg-muted border border-edge-base">
                          {modeLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-4 flex-1 space-y-3">
                    {/* Skip note */}
                    {skippedBefore.has(spin.id) && (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-fg-muted font-medium flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 11.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm.75-3.5a.75.75 0 0 1-1.5 0v-4a.75.75 0 0 1 1.5 0v4z"/>
                          </svg>
                          Choose turn skipped
                        </p>
                        <span className="text-[11px] font-semibold text-fg-muted">+{TICKET_AWARDS.turn_skipped} 🎟️</span>
                      </div>
                    )}
                    {/* Result */}
                    <div>
                      <p className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider mb-1">Result</p>
                      {spin.result_name ? (
                        <p className="text-base font-bold text-fg-base leading-snug">{spin.result_name}</p>
                      ) : (
                        <p className="text-sm text-fg-subtle italic">No game selected</p>
                      )}
                    </div>

                    {/* Also on the wheel / also considered */}
                    {otherGames.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                          {spin.games_list ? 'Also on the wheel' : 'Also considered'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {otherGames.map((opt, i) => (
                            <span
                              key={i}
                              className="text-xs text-fg-secondary bg-surface-active border border-edge-base rounded-lg px-2.5 py-1"
                            >
                              {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card footer — cost */}
                  {cost && (
                    <div className="px-4 py-2.5 border-t border-edge-subtle bg-surface-sunken">
                      <span className={`text-xs font-semibold ${cost.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}>
                        {cost}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/wheel/history?page=${page - 1}`}
                    className="px-3 py-1.5 border border-edge-base rounded-lg text-fg-secondary hover:bg-surface-hover transition-colors"
                  >
                    ← Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/wheel/history?page=${page + 1}`}
                    className="px-3 py-1.5 border border-edge-base rounded-lg text-fg-secondary hover:bg-surface-hover transition-colors"
                  >
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-fg-subtle">
          <p className="text-4xl mb-3">🎡</p>
          <p className="font-medium text-fg-secondary">No wheel spins yet</p>
          <p className="text-sm mt-1">
            Head to the{' '}
            <Link href="/wheel" className="text-brand-600 hover:underline dark:text-brand-400">Wheel</Link>
            {' '}to get started.
          </p>
        </div>
      )}
    </div>
  )
}
