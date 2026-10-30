import GameForm from '@/components/games/GameForm'

const VALID_STATUSES = ['playing', 'completed', 'backlog', 'dnf', 'ambient']

export default function NewGamePage({ searchParams }: { searchParams: { status?: string } }) {
  const defaultStatus = VALID_STATUSES.includes(searchParams.status ?? '') ? searchParams.status : undefined
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Add a Game</h1>
        <p className="text-sm text-fg-muted mt-0.5">Track a new game on your list.</p>
      </div>
      <GameForm defaultStatus={defaultStatus} />
    </div>
  )
}
