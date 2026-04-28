import type { GameStatus } from '@/lib/types'

const styles: Record<GameStatus, string> = {
  backlog: 'bg-surface-active text-fg-secondary',
  playing: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  dnf: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400',
}

const labels: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  completed: 'Completed',
  dnf: 'DNF',
}

export default function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
