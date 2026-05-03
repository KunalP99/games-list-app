'use client'

import { useRouter } from 'next/navigation'
import StatusBadge from './StatusBadge'
import type { Game } from '@/lib/types'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export default function GameTableView({ games, isOwner }: { games: Game[]; isOwner: boolean }) {
  const router = useRouter()

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge-base">
            <th className="px-4 py-3 text-left text-xs font-semibold text-fg-subtle uppercase tracking-wider">Title</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-fg-subtle uppercase tracking-wider hidden md:table-cell">Developer</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-fg-subtle uppercase tracking-wider hidden md:table-cell">Platform</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-fg-subtle uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wider">Hours</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wider hidden md:table-cell">Achiev.</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wider">Rating</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-fg-subtle uppercase tracking-wider hidden sm:table-cell">Flags</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wider hidden lg:table-cell">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-base">
          {games.map(game => (
            <tr
              key={game.id}
              onClick={() => router.push(`/games/${game.id}`)}
              className="cursor-pointer hover:bg-surface-active transition-colors"
            >
              {/* Title */}
              <td className="px-4 py-3 max-w-[200px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {game.is_favourite && <span className="text-amber-400 shrink-0">★</span>}
                  <span className="font-medium text-fg-base truncate">{game.title}</span>
                </div>
              </td>

              {/* Developer */}
              <td className="px-4 py-3 text-fg-muted truncate max-w-[140px] hidden md:table-cell">
                {game.developer ?? '—'}
              </td>

              {/* Platform */}
              <td className="px-4 py-3 text-fg-subtle hidden md:table-cell">
                {game.platform ?? '—'}
              </td>

              {/* Status */}
              <td className="px-4 py-3">
                <StatusBadge status={game.status} />
              </td>

              {/* Hours */}
              <td className="px-4 py-3 text-right text-fg-muted tabular-nums">
                {game.hours_played != null ? `${game.hours_played}h` : '—'}
              </td>

              {/* Achievements */}
              <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums">
                {game.achievement_progress != null ? (
                  game.achievement_progress === 100 ? (
                    <span className="font-semibold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100%</span>
                  ) : (
                    <span className="text-fg-muted">{Math.round(game.achievement_progress)}%</span>
                  )
                ) : '—'}
              </td>

              {/* Rating */}
              <td className="px-4 py-3 text-right tabular-nums">
                {game.rating != null ? (
                  <span className="text-fg-muted">
                    <span className="text-amber-400">★</span> {game.rating}/5
                  </span>
                ) : '—'}
              </td>

              {/* Flags */}
              <td className="px-4 py-3 hidden sm:table-cell">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {game.is_replay && (
                    <span className="text-orange-400" title="Replay">↩</span>
                  )}
                  {game.is_sequel && (
                    <span className="text-violet-500" title="Sequel">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                    </span>
                  )}
                </div>
              </td>

              {/* Date */}
              <td className="px-4 py-3 text-right text-fg-subtle hidden lg:table-cell tabular-nums">
                {formatDate(game.completion_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
