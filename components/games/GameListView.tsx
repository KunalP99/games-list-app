import GameCard from './GameCard'
import type { Game } from '@/lib/types'

function CompletedByYear({ games, isOwner }: { games: Game[]; isOwner: boolean }) {
  const byYear = games.reduce<Record<string, Game[]>>((acc, game) => {
    const year = game.completion_date
      ? new Date(game.completion_date).getFullYear().toString()
      : 'Unknown'
    ;(acc[year] ??= []).push(game)
    return acc
  }, {})

  const years = Object.keys(byYear).sort((a, b) => {
    if (a === 'Unknown') return 1
    if (b === 'Unknown') return -1
    return Number(b) - Number(a)
  })

  return (
    <div className="space-y-8">
      {years.map(year => (
        <div key={year}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-fg-base">{year}</h2>
            <span className="text-xs text-fg-subtle font-medium">
              {byYear[year].length} game{byYear[year].length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {byYear[year].map(game => (
              <GameCard key={game.id} game={game} isOwner={isOwner} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function GameListView({
  games,
  status,
  isOwner = true,
}: {
  games: Game[]
  status: string
  isOwner?: boolean
}) {
  if (status === 'completed') {
    return <CompletedByYear games={games} isOwner={isOwner} />
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {games.map(game => (
        <GameCard key={game.id} game={game} isOwner={isOwner} />
      ))}
    </div>
  )
}
