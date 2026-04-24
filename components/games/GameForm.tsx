'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGame, updateGame } from '@/app/(app)/games/actions'
import type { Game } from '@/lib/types'

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'playing', label: 'Playing' },
  { value: 'completed', label: 'Completed' },
]

export default function GameForm({ game }: { game?: Game }) {
  const isEdit = !!game
  const router = useRouter()
  const [status, setStatus] = useState(game?.status ?? 'backlog')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = isEdit
      ? await updateGame(game.id, formData)
      : await createGame(formData)

    if (result && 'error' in result) {
      setError(result.error as string)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Info */}
      <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Basic Info</h2>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            name="title"
            required
            defaultValue={game?.title}
            className={input}
            placeholder="e.g. The Witcher 3"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Developer</label>
            <input
              name="developer"
              defaultValue={game?.developer ?? ''}
              className={input}
              placeholder="e.g. CD Projekt Red"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Release Date</label>
            <input
              name="release_date"
              type="date"
              defaultValue={game?.release_date ?? ''}
              className={input}
            />
          </div>
        </div>
      </section>

      {/* Status & Progress */}
      <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Status & Progress</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
            <select
              name="status"
              value={status}
              onChange={e => setStatus(e.target.value as 'backlog' | 'playing' | 'completed')}
              className={input}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Hours Played</label>
            <input
              name="hours_played"
              type="number"
              min={0}
              step={0.5}
              defaultValue={game?.hours_played ?? ''}
              className={input}
              placeholder="e.g. 42"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Achievement Progress (%)
          </label>
          <input
            name="achievement_progress"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={game?.achievement_progress != null ? Math.round(game.achievement_progress) : ''}
            className={input}
            placeholder="e.g. 75"
          />
        </div>

        {/* Completion fields — only shown when status is completed */}
        {status === 'completed' && (
          <div className="space-y-4 pt-2 border-t border-zinc-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Completion Date</label>
                <input
                  name="completion_date"
                  type="date"
                  defaultValue={game?.completion_date ?? ''}
                  className={input}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Rating (1–10)</label>
                <input
                  name="rating"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={game?.rating ?? ''}
                  className={input}
                  placeholder="e.g. 9"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Review</label>
              <textarea
                name="review"
                rows={4}
                defaultValue={game?.review ?? ''}
                className={input}
                placeholder="What did you think?"
              />
            </div>
          </div>
        )}
      </section>

      {/* Notes — always visible, private */}
      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Notes</h2>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          Personal notes <span className="text-xs text-zinc-400">(private)</span>
        </label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={game?.notes ?? ''}
          className={input}
          placeholder="Personal reminders, tips, etc."
        />
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Game'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 border border-zinc-200 text-zinc-600 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

const input = 'w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white'
