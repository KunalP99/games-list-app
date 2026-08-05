import GameCard from './GameCard'
import CoverCard from './CoverCard'
import GameTableView from './GameTableView'
import type { Game } from '@/lib/types'

const COVER_GRID = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
const CARD_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

// A responsive grid of game cards in the given view (capsule or box-art cover).
function CardGrid({ games, isOwner, cover }: { games: Game[]; isOwner: boolean; cover: boolean }) {
  return (
    <div className={cover ? COVER_GRID : CARD_GRID}>
      {games.map(game =>
        cover
          ? <CoverCard key={game.id} game={game} isOwner={isOwner} />
          : <GameCard key={game.id} game={game} isOwner={isOwner} />,
      )}
    </div>
  )
}

function groupByYear(games: Game[]) {
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
  return { byYear, years }
}

function CompletedByYear({ games, isOwner, cover }: { games: Game[]; isOwner: boolean; cover: boolean }) {
  const { byYear, years } = groupByYear(games)
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
          <CardGrid games={byYear[year]} isOwner={isOwner} cover={cover} />
        </div>
      ))}
    </div>
  )
}

export default function GameListView({
  games,
  status,
  isOwner = true,
  view = 'grid',
}: {
  games: Game[]
  status: string
  isOwner?: boolean
  view?: 'grid' | 'table' | 'cover'
}) {
  if (view === 'cover') {
    if (status === 'completed') return <CompletedByYear games={games} isOwner={isOwner} cover />
    return <CardGrid games={games} isOwner={isOwner} cover />
  }

  if (view === 'table') {
    if (status === 'completed') {
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
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold text-fg-base">{year}</h2>
                <span className="text-xs text-fg-subtle font-medium">
                  {byYear[year].length} game{byYear[year].length !== 1 ? 's' : ''}
                </span>
              </div>
              <GameTableView games={byYear[year]} isOwner={isOwner} />
            </div>
          ))}
        </div>
      )
    }
    return <GameTableView games={games} isOwner={isOwner} />
  }

  if (status === 'completed') {
    return <CompletedByYear games={games} isOwner={isOwner} cover={false} />
  }

  return <CardGrid games={games} isOwner={isOwner} cover={false} />
}
