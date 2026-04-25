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

  const { data: sameGames } = await supabase
    .from('games')
    .select('id, created_at')
    .eq('user_id', game.user_id)
    .ilike('title', game.title)
    .order('created_at', { ascending: true }) as { data: { id: string; created_at: string }[] | null }

  const totalPlaythroughs = sameGames?.length ?? 1
  const playthroughNumber = (sameGames?.findIndex(g => g.id === game.id) ?? 0) + 1

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-900">{game.title}</h1>
            {game.is_favourite && (
              <span className="text-amber-400 text-xl leading-none" title="Favourite">★</span>
            )}
            <StatusBadge status={game.status} />
            {game.is_replay && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                ↩ Replay
              </span>
            )}
          </div>
          <p className="text-zinc-500 text-sm">
            {[game.developer, game.release_date ? new Date(game.release_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null, game.platform].filter(Boolean).join(' · ')}
          </p>
          {totalPlaythroughs > 1 && (
            <p className="text-xs text-zinc-400 mt-1">
              Playthrough {playthroughNumber} of {totalPlaythroughs}
            </p>
          )}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Hours Played" value={game.hours_played != null ? `${game.hours_played}h` : '—'} />
        <RatingStat rating={game.rating} />
        <AchievementStat progress={game.achievement_progress} />
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

function colorGradient(value: number, max: number): string {
  const pct = (value / max) * 100
  if (pct === 100) return 'bg-gradient-to-br from-emerald-400 to-teal-500'
  if (pct >= 75)   return 'bg-gradient-to-br from-green-400 to-emerald-500'
  if (pct >= 50)   return 'bg-gradient-to-br from-amber-400 to-orange-400'
  if (pct >= 20)   return 'bg-gradient-to-br from-orange-400 to-red-400'
  return                  'bg-gradient-to-br from-red-500 to-rose-600'
}

function RatingStat({ rating }: { rating: number | null }) {
  if (rating == null) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Rating</p>
        <p className="mt-1 text-lg font-bold text-zinc-900">—</p>
      </div>
    )
  }

  return (
    <div className={`${colorGradient(rating, 10)} rounded-xl p-4`}>
      <p className="text-xs text-white/80 font-medium uppercase tracking-wider">Rating</p>
      <p className="mt-1 text-lg font-bold text-white">{rating}/10</p>
    </div>
  )
}

function AchievementStat({ progress }: { progress: number | null }) {
  if (progress == null) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Achievements</p>
        <p className="mt-1 text-lg font-bold text-zinc-900">—</p>
      </div>
    )
  }

  const is100 = progress === 100

  return (
    <div className="relative">
      {is100 && (
        <>
          <span className="absolute -top-3 left-0 text-yellow-300 text-base leading-none select-none">✦</span>
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-yellow-200 text-xs leading-none select-none">✦</span>
          <span className="absolute -top-3 right-0 text-yellow-300 text-base leading-none select-none">✦</span>
          <span className="absolute -bottom-3 left-0 text-yellow-300 text-sm leading-none select-none">✦</span>
          <span className="absolute -bottom-3 right-0 text-yellow-300 text-sm leading-none select-none">✦</span>
        </>
      )}
      <div className={`${colorGradient(progress, 100)} rounded-xl p-4 ${is100 ? 'ring-2 ring-emerald-300 ring-offset-1' : ''}`}>
        <p className="text-xs text-white/80 font-medium uppercase tracking-wider">Achievements</p>
        <p className="mt-1 text-lg font-bold text-white">{Math.round(progress)}%</p>
        {is100 && <p className="text-xs text-white/80 mt-0.5">Complete ✓</p>}
      </div>
    </div>
  )
}
