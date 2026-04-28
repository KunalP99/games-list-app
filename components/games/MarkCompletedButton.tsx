'use client'

import { useTransition } from 'react'
import { markAsCompleted } from '@/app/(app)/games/actions'

export default function MarkCompletedButton({
  gameId,
  variant = 'card',
}: {
  gameId: string
  variant?: 'card' | 'detail'
}) {
  const [pending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await markAsCompleted(gameId)
    })
  }

  if (variant === 'detail') {
    return (
      <button
        onClick={handleClick}
        disabled={pending}
        className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Saving…' : '✓ Mark as Completed'}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50 transition-colors dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
    >
      {pending ? '…' : 'Mark Complete'}
    </button>
  )
}
