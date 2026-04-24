import type { GameStatus } from '@/lib/types'

const styles: Record<GameStatus, string> = {
  backlog: 'bg-zinc-100 text-zinc-600',
  playing: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
}

const labels: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  completed: 'Completed',
}

export default function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
