'use client'

import { useState, useTransition } from 'react'
import { markAsCompleted } from '@/app/(app)/games/actions'

const STAR_PATH = "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"

function StarPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value ?? 0

  function resolveValue(e: React.MouseEvent<HTMLButtonElement>, star: number) {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX < rect.left + rect.width / 2 ? star - 0.5 : star
  }

  return (
    <div className="flex gap-0.5">
      {/* Gradient definition — references accent CSS variables so it updates live */}
      <svg width="0" height="0" className="absolute overflow-hidden">
        <defs>
          <linearGradient id="star-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand-400))" />
            <stop offset="100%" stopColor="rgb(var(--brand-700))" />
          </linearGradient>
        </defs>
      </svg>

      {[1, 2, 3, 4, 5].map(star => {
        const filled = Math.min(Math.max(display - (star - 1), 0), 1)
        return (
          <button
            key={star}
            type="button"
            onMouseMove={e => setHover(resolveValue(e, star))}
            onMouseLeave={() => setHover(null)}
            onClick={e => {
              const next = resolveValue(e, star)
              onChange(next === value ? null : next)
            }}
            className="relative p-0.5 transition-transform hover:scale-110"
          >
            {/* Empty star base */}
            <svg className="w-7 h-7 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={STAR_PATH} />
            </svg>
            {/* Filled overlay — accent gradient, clipped to 50% for half stars */}
            {filled > 0 && (
              <svg
                className="w-7 h-7 absolute top-0.5 left-0.5"
                fill="url(#star-gradient)"
                viewBox="0 0 24 24"
                style={filled < 1 ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
              >
                <path d={STAR_PATH} />
              </svg>
            )}
          </button>
        )
      })}
      {value !== null && (
        <span className="ml-1.5 text-sm text-fg-muted self-center">{value}/5</span>
      )}
    </div>
  )
}

const inputClass = 'w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input'

export default function MarkCompletedButton({
  gameId,
  variant = 'card',
}: {
  gameId: string
  variant?: 'card' | 'detail'
}) {
  const [pending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [hours, setHours] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [achievementProgress, setAchievementProgress] = useState('')
  const [completionDate, setCompletionDate] = useState(() => new Date().toISOString().split('T')[0])

  function handleCardClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => { await markAsCompleted(gameId) })
  }

  function handleConfirm() {
    startTransition(async () => {
      await markAsCompleted(gameId, {
        hours: hours ? Number(hours) : null,
        rating,
        achievementProgress: achievementProgress ? Number(achievementProgress) : null,
        completionDate,
      })
      setShowModal(false)
    })
  }

  if (variant === 'detail') {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          disabled={pending}
          className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : '✓ Mark as Completed'}
        </button>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => !pending && setShowModal(false)}
            />
            <div className="relative w-full max-w-md bg-surface-base border border-edge-base rounded-2xl shadow-2xl p-6 space-y-5">

              <div>
                <h2 className="text-lg font-semibold text-fg-base">Mark as Completed</h2>
                <p className="text-sm text-fg-muted mt-0.5">All fields are optional — fill in what you know.</p>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-2">Rating</label>
                <StarPicker value={rating} onChange={setRating} />
              </div>

              {/* Hours */}
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">Hours Played</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  placeholder="e.g. 25"
                  className={inputClass}
                />
              </div>

              {/* Achievement Progress */}
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">Achievement Progress</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={achievementProgress}
                    onChange={e => setAchievementProgress(e.target.value)}
                    placeholder="0–100"
                    className={`${inputClass} pr-8`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-muted pointer-events-none">%</span>
                </div>
              </div>

              {/* Completion Date */}
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">Date Completed</label>
                <input
                  type="date"
                  value={completionDate}
                  onChange={e => setCompletionDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={pending}
                  className="px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg-base border border-edge-base rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {pending ? 'Saving…' : 'Mark as Completed'}
                </button>
              </div>

            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <button
      onClick={handleCardClick}
      disabled={pending}
      className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50 transition-colors dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
    >
      {pending ? '…' : 'Mark Complete'}
    </button>
  )
}
