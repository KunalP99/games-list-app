import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { SPIN_TYPE_BADGE, SPIN_TYPE_LABEL, spinModeLabel, rerollRunnerUp, summariseSpends, type SpinType, type SpinMode, type FinalizedVia, type TicketSpend } from '@/lib/wheel-history'
import { TICKET_AWARDS } from '@/lib/constants'
import SpinTime from '@/components/wheel/SpinTime'

const PAGE_SIZE = 20

// Leads each timeline entry, tinted with that player's accent colour — it
// carries the turn type at a glance where the old card layout used a badge in
// a header bar. 'choose_skip' never reaches the list (it's filtered out below),
// but the map stays exhaustive over SpinType.
const SPIN_TYPE_ICON: Record<SpinType, string> = {
  spin: '🎡',
  spin_reroll: '🔁',
  choose: '🎯',
  choose_skip: '⏭️',
}

// What the player did, phrased to run on from their name: "Sam spun the wheel → X".
const SPIN_TYPE_VERB: Record<SpinType, string> = {
  spin: 'spun the wheel →',
  spin_reroll: 'spun & rerolled →',
  choose: 'chose',
  choose_skip: 'skipped their turn',
}

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
  finalized_via: FinalizedVia | null
  ticket_spends: TicketSpend[] | null
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
          {/* One continuous log rather than a card grid: a grid row stretches
              every card to the tallest one in it, so a Choose turn with nothing
              but a result got padded out with dead space to match a Spin &
              Reroll carrying spend rows and a wheel list. Here each entry is
              only as tall as what it actually has to show. */}
          <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden divide-y divide-edge-subtle">
            {pageSpins.map(spin => {
              const isCurrentUser = spin.user_id === user!.id
              const displayName = isCurrentUser
                ? 'You'
                : (spin.profiles?.display_name ?? spin.profiles?.username ?? 'Unknown')
              const accentColour = spin.profiles?.accent_colour ?? '#7c3aed'
              const badge = SPIN_TYPE_BADGE[spin.spin_type]
              const label = SPIN_TYPE_LABEL[spin.spin_type]
              const spendRows = summariseSpends(spin.ticket_spends, spin.finalized_via, spin.tickets_spent)
              const modeLabel = spinModeLabel(spin.spin_mode)
              const otherGames = spin.games_list
                ? spin.games_list.filter(g => g.toLowerCase() !== (spin.result_name ?? '').toLowerCase())
                : [spin.option_a_name, spin.option_b_name].filter(Boolean) as string[]
              const runnerUp = rerollRunnerUp(spin.spin_type, spin.finalized_via, spin.option_a_name, spin.option_b_name, spin.result_name)
              const wasSkipped = skippedBefore.has(spin.id)
              // The whole point of the layout: this block only exists when
              // there is something to put in it.
              const hasDetail = wasSkipped || spendRows.length > 0 || otherGames.length > 0

              return (
                <div
                  key={spin.id}
                  className="flex gap-3 px-4 py-3"
                  // Your own spins stay distinguishable on a page showing
                  // everyone's — the old layout did this with a tinted card
                  // header and accent border, neither of which exists now.
                  style={isCurrentUser ? { backgroundColor: `${accentColour}0f` } : undefined}
                >
                  <div
                    className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm select-none"
                    style={{ backgroundColor: `${accentColour}26` }}
                    aria-hidden
                  >
                    {SPIN_TYPE_ICON[spin.spin_type]}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
                      <span className="text-sm font-semibold text-fg-base">{displayName}</span>
                      <span className="text-sm text-fg-muted">{SPIN_TYPE_VERB[spin.spin_type]}</span>
                      {spin.result_name ? (
                        <span className="text-sm font-bold text-fg-base">{spin.result_name}</span>
                      ) : (
                        <span className="text-sm text-fg-subtle italic">No game selected</span>
                      )}
                      {badge && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border ${badge.className}`}>
                          {label}
                        </span>
                      )}
                      {modeLabel && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface-active text-fg-muted border border-edge-base">
                          {modeLabel}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-fg-subtle whitespace-nowrap">
                        <SpinTime iso={spin.created_at} />
                      </span>
                    </div>

                    {hasDetail && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {/* Amount sits directly after its label rather than
                            pushed to the far edge — these rows now span the
                            full page width, and a number a thousand pixels
                            from its label doesn't read as belonging to it. */}
                        {wasSkipped && (
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-fg-muted font-medium">Choose turn skipped</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">+{TICKET_AWARDS.turn_skipped} 🎟️</span>
                          </div>
                        )}
                        {spendRows.map((row, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="text-fg-muted font-medium">
                              {row.note}{row.count > 1 ? ` (×${row.count})` : ''}
                            </span>
                            <span className="font-semibold text-red-500 dark:text-red-400 whitespace-nowrap">−{row.amount} 🎟️</span>
                          </div>
                        ))}
                        {otherGames.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-fg-subtle mr-0.5">
                              {spin.games_list ? 'Also on the wheel:' : 'Also considered:'}
                            </span>
                            {otherGames.map((opt, i) => {
                              const isRunnerUp = runnerUp != null && opt.toLowerCase() === runnerUp.toLowerCase()
                              return (
                                <span
                                  key={i}
                                  title={isRunnerUp ? `Rerolled away from — you chose ${spin.result_name} over this` : undefined}
                                  className={
                                    isRunnerUp
                                      // Deliberately a lighter, lower-weight
                                      // amber than the "Spin + Reroll" badge
                                      // on the same row (amber-100 / 700 /
                                      // semibold). Same hue reads as related,
                                      // which they are — but the pill stays
                                      // clearly subordinate instead of
                                      // competing with the badge.
                                      ? 'text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 dark:bg-amber-900/20 dark:text-amber-300/90 dark:border-amber-800'
                                      : 'text-[11px] text-fg-secondary bg-surface-active border border-edge-base rounded-md px-2 py-0.5'
                                  }
                                >
                                  {opt}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
