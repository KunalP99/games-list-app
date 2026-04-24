import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import StatusBadge from '@/components/games/StatusBadge'
import DeleteGameButton from '@/components/games/DeleteGameButton'

export default async function GameDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', params.id)
    .single() as { data: Game | null }

  if (!game) notFound()

  const isOwner = game.user_id === user?.id

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-zinc-900">{game.title}</h1>
            <StatusBadge status={game.status} />
          </div>
          <p className="text-zinc-500 text-sm">
            {[game.developer, game.year_developed].filter(Boolean).join(' · ')}
          </p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/games/${game.id}/edit`}
              className="px-3 py-1.5 border border-zinc-200 text-zinc-600 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Edit
            </Link>
            <DeleteGameButton id={game.id} />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Hours Played" value={game.hours_played != null ? `${game.hours_played}h` : '—'} />
        <Stat label="Rating" value={game.rating != null ? `${game.rating}/10` : '—'} />
        <Stat label="Achievements" value={game.achievement_progress != null ? `${game.achievement_progress}%` : '—'} />
        <Stat label="In Wheel" value={game.in_wheel ? 'Yes' : 'No'} />
      </div>

      {/* Completion date */}
      {game.completion_date && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-1">Completed</p>
          <p className="text-zinc-900 text-sm">
            {new Date(game.completion_date).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
      )}

      {/* Review */}
      {game.review && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2">Review</p>
          <p className="text-zinc-700 text-sm leading-relaxed whitespace-pre-wrap">{game.review}</p>
        </div>
      )}

      {/* Notes — only visible to owner */}
      {isOwner && game.notes && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2">
            Notes <span className="normal-case font-normal">(private)</span>
          </p>
          <p className="text-zinc-700 text-sm leading-relaxed whitespace-pre-wrap">{game.notes}</p>
        </div>
      )}

      <Link href="/games" className="inline-block text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
        ← Back to My Games
      </Link>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-lg font-bold text-zinc-900">{value}</p>
    </div>
  )
}
