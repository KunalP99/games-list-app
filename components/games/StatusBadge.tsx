import type { GameStatus } from '@/lib/types'

const styles: Record<GameStatus, string> = {
  backlog: 'bg-surface-active text-fg-secondary',
  playing: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  dnf: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  // Violet would collide with the brand accent, which follows each viewer's
  // own colour; teal is clear of all four of the above.
  ambient: 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
}

const labels: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  completed: 'Completed',
  dnf: 'DNF',
  ambient: 'Ambient',
}

export default function StatusBadge({ status }: { status: GameStatus }) {
  // Ambient games never show a pill, anywhere this renders — they're meant to
  // read as "just running", not as a tracked status alongside Playing/Backlog/
  // Completed/DNF. Singled out here, at the source, rather than at each call
  // site, so there's exactly one place this rule lives.
  if (status === 'ambient') return null

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
