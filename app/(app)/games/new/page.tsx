import GameForm from '@/components/games/GameForm'

const VALID_STATUSES = ['playing', 'completed', 'backlog', 'dnf', 'ambient']

export default function NewGamePage({ searchParams }: { searchParams: { status?: string; title?: string } }) {
  const defaultStatus = VALID_STATUSES.includes(searchParams.status ?? '') ? searchParams.status : undefined
  // The desktop agent sends a guessed title here when it can't match a running
  // program to anything already in the library — a starting point for the
  // search, not a claim about what the game actually is.
  const defaultTitle = searchParams.title?.trim().slice(0, 200) || undefined
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Add a Game</h1>
        <p className="text-sm text-fg-muted mt-0.5">Track a new game on your list.</p>
      </div>
      <GameForm defaultStatus={defaultStatus} defaultTitle={defaultTitle} />
    </div>
  )
}
