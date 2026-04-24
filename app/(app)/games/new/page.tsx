import GameForm from '@/components/games/GameForm'

export default function NewGamePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Add a Game</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Track a new game on your list.</p>
      </div>
      <GameForm />
    </div>
  )
}
