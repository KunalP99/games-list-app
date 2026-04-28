import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const PAGE_SIZE = 20

const REASON_BADGE: Record<string, { label: string; className: string }> = {
  game_completed_short:     { label: 'CS',    className: 'bg-brand-100 text-brand-700 border border-brand-200' },
  game_completed_medium:    { label: 'CM',    className: 'bg-brand-200 text-brand-800 border border-brand-300' },
  game_completed_long:      { label: 'CL',    className: 'bg-brand-300 text-brand-900 border border-brand-400' },
  game_completed_bonus_hours: { label: '+h',  className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  achievement_100_percent:  { label: '100%',  className: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white border-0' },
  sequel_back_to_back:      { label: 'SQ',    className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  series_back_to_back:      { label: 'SE',    className: 'bg-blue-100 text-blue-800 border border-blue-200' },
  turn_skipped:             { label: 'SKIP',  className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  objective_completed:      { label: 'OBJ',   className: 'bg-violet-50 text-violet-700 border border-violet-200' },
  spin:                     { label: 'SPIN',  className: 'bg-surface-active text-fg-secondary border border-edge-base' },
  spin_reroll:              { label: 'RE',    className: 'bg-surface-active text-fg-secondary border border-edge-base' },
  choose_game:              { label: 'PICK',  className: 'bg-surface-active text-fg-secondary border border-edge-base' },
  choose_other_player_game: { label: 'PICK×', className: 'bg-red-50 text-red-600 border border-red-200' },
  assigned_game_incomplete: { label: 'DNF',   className: 'bg-red-50 text-red-600 border border-red-200' },
  objective_incomplete:     { label: 'OBJ−',  className: 'bg-red-50 text-red-600 border border-red-200' },
  admin_adjustment:         { label: 'ADJ',   className: 'bg-surface-active text-fg-muted border border-edge-base' },
}

function ReasonBadge({ reason, amount }: { reason: string; amount: number }) {
  const cfg = REASON_BADGE[reason]
  if (!cfg) return null
  const label = reason === 'game_completed_bonus_hours' ? `+${amount}h` : cfg.label
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${cfg.className}`}>
      {label}
    </span>
  )
}

type RawTx = {
  id: string
  user_id: string
  amount: number
  reason: string
  game_id: string | null
  wheel_turn_at_time: string | null
  balance_before: number
  balance_after: number
  note: string | null
  created_at: string
  games: { id: string; title: string } | null
  profiles: { id: string; username: string; display_name: string | null } | null
}

type Group = {
  key: string
  user: { id: string; username: string; display_name: string | null } | null
  game: { id: string; title: string } | null
  transactions: RawTx[]
  totalAmount: number
  balanceBefore: number
  balanceAfter: number
  latestDate: string
}

function groupTransactions(transactions: RawTx[]): Group[] {
  const map = new Map<string, RawTx[]>()

  for (const tx of transactions) {
    // Include user_id in key so different users' completions of the same game stay separate
    const key = tx.game_id ? `${tx.user_id}:${tx.game_id}` : `solo:${tx.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(tx)
  }

  const groups: Group[] = []
  for (const [key, txs] of Array.from(map)) {
    txs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    groups.push({
      key,
      user: txs[0].profiles ?? null,
      game: txs[0].games ?? null,
      transactions: txs,
      totalAmount: txs.reduce((s, t) => s + t.amount, 0),
      balanceBefore: txs[0].balance_before,
      balanceAfter: txs[txs.length - 1].balance_after,
      latestDate: txs[txs.length - 1].created_at,
    })
  }

  groups.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime())
  return groups
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: allTransactions } = await supabase
    .from('ticket_transactions')
    .select('*, games(id, title), profiles(id, username, display_name)')
    .order('created_at', { ascending: false }) as { data: RawTx[] | null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ticket_balance')
    .eq('id', user!.id)
    .single() as { data: { ticket_balance: number } | null }

  const groups = groupTransactions(allTransactions ?? [])
  const page = Math.max(1, Number(searchParams.page ?? 1))
  const totalPages = Math.ceil(groups.length / PAGE_SIZE)
  const pageGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg-base">Ticket History</h1>
          <p className="text-sm text-fg-muted mt-0.5">{groups.length} entries</p>
        </div>
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 dark:bg-brand-900/30 dark:border-brand-700">
          <span className="text-sm text-brand-600 dark:text-brand-300 font-medium">My Balance</span>
          <span className="text-2xl font-bold text-brand-700 dark:text-brand-300">🎟️ {profile?.ticket_balance ?? 0}</span>
        </div>
      </div>

      {pageGroups.length > 0 ? (
        <>
          <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-subtle bg-surface-sunken">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden md:table-cell">Game</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden sm:table-cell">Reasons</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">Change</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hidden lg:table-cell whitespace-nowrap">Before</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {pageGroups.map(group => {
                  const isPositive = group.totalAmount > 0
                  const isCurrentUser = group.user?.id === user!.id
                  const displayName = isCurrentUser
                    ? 'You'
                    : (group.user?.display_name ?? group.user?.username ?? '—')

                  return (
                    <tr
                      key={group.key}
                      className={`hover:bg-surface-hover transition-colors ${isCurrentUser ? 'bg-brand-50/30 dark:bg-brand-900/20' : ''}`}
                    >
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">
                        {new Date(group.latestDate).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${isCurrentUser ? 'text-brand-700 dark:text-brand-300' : 'text-fg-secondary'}`}>
                          {displayName}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {group.game ? (
                          <Link
                            href={`/games/${group.game.id}`}
                            className="text-fg-secondary hover:text-brand-600 transition-colors dark:hover:text-brand-400"
                          >
                            {group.game.title}
                          </Link>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {group.transactions.map(tx => (
                            <ReasonBadge key={tx.id} reason={tx.reason} amount={tx.amount} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        <span className={isPositive ? 'text-emerald-600' : 'text-red-500'}>
                          {isPositive ? '+' : ''}{group.totalAmount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-fg-subtle tabular-nums hidden lg:table-cell">
                        {group.balanceBefore}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-fg-secondary tabular-nums">
                        {group.balanceAfter}
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
                    href={`/tickets?page=${page - 1}`}
                    className="px-3 py-1.5 border border-edge-base rounded-lg text-fg-secondary hover:bg-surface-hover transition-colors"
                  >
                    ← Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/tickets?page=${page + 1}`}
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
          <p className="text-4xl mb-3">🎟️</p>
          <p className="font-medium text-fg-secondary">No transactions yet</p>
          <p className="text-sm mt-1">Complete a game to earn your first tickets.</p>
        </div>
      )}
    </div>
  )
}
