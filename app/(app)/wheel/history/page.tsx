import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { SPIN_TYPE_BADGE, inferCost, spinModeLabel, type SpinType, type SpinMode } from '@/lib/wheel-history'

const PAGE_SIZE = 20

type RawSpin = {
  id: string
  user_id: string
  spin_type: SpinType
  spin_mode: SpinMode
  result_name: string | null
  option_a_name: string | null
  option_b_name: string | null
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

  const page = Math.max(1, Number(searchParams.page ?? 1))
  const all = spins ?? []
  const totalPages = Math.ceil(all.length / PAGE_SIZE)
  const pageSpins = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Wheel History</h1>
        <p className="text-sm text-fg-muted mt-0.5">{all.length} spin{all.length !== 1 ? 's' : ''} across all players</p>
      </div>

      {pageSpins.length > 0 ? (
        <>
          <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-subtle bg-surface-sunken">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden sm:table-cell">Mode</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Result</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden lg:table-cell">Options</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap hidden md:table-cell">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {pageSpins.map(spin => {
                  const isCurrentUser = spin.user_id === user!.id
                  const displayName = isCurrentUser
                    ? 'You'
                    : (spin.profiles?.display_name ?? spin.profiles?.username ?? '—')
                  const badge = SPIN_TYPE_BADGE[spin.spin_type]
                  const cost = inferCost(spin.spin_type, spin.spin_mode)
                  const modeLabel = spinModeLabel(spin.spin_mode)
                  const accentColour = spin.profiles?.accent_colour ?? null

                  return (
                    <tr
                      key={spin.id}
                      className={`hover:bg-surface-hover transition-colors ${isCurrentUser ? 'bg-surface-active' : ''}`}
                      style={!isCurrentUser && accentColour ? { backgroundColor: `${accentColour}18` } : undefined}
                    >
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">
                        {new Date(spin.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${isCurrentUser ? 'text-fg-base' : 'text-fg-secondary'}`}>
                          {displayName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {badge && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {modeLabel
                          ? <span className="text-fg-secondary text-xs">{modeLabel}</span>
                          : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-fg-base">
                        {spin.result_name ?? <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {spin.option_a_name || spin.option_b_name ? (
                          <div className="flex flex-wrap gap-1">
                            {[spin.option_a_name, spin.option_b_name].filter(Boolean).map((opt, i) => (
                              <span key={i} className="text-xs text-fg-muted bg-surface-active rounded px-1.5 py-0.5">
                                {opt}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {cost ? (
                          <span className={`text-xs font-semibold ${cost.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}>
                            {cost}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
