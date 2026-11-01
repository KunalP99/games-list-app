import GameCard from './GameCard'
import CoverCard from './CoverCard'
import GameTableView from './GameTableView'
import type { Game } from '@/lib/types'

const COVER_GRID = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
const CARD_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

// A responsive grid of game cards in the given view (capsule or box-art cover).
function CardGrid({
  games,
  isOwner,
  cover,
  showReleaseDate = false,
  liveSessions,
}: {
  games: Game[]
  isOwner: boolean
  cover: boolean
  showReleaseDate?: boolean
  liveSessions: Map<string, string>
}) {
  return (
    <div className={cover ? COVER_GRID : CARD_GRID}>
      {games.map(game =>
        cover
          ? <CoverCard key={game.id} game={game} isOwner={isOwner} showReleaseDate={showReleaseDate} liveSince={liveSessions.get(game.id) ?? null} />
          : <GameCard key={game.id} game={game} isOwner={isOwner} showReleaseDate={showReleaseDate} liveSince={liveSessions.get(game.id) ?? null} />,
      )}
    </div>
  )
}

// A backlog game is "coming soon" when it has a release date still in the future.
function isComingSoon(game: Game, today: string) {
  return !!game.release_date && game.release_date > today
}

// Backlog view — splits games you can play now from unreleased ones, which go
// into a separate "Coming Soon" section (soonest first) showing each release date.
function BacklogView({ games, isOwner, view, liveSessions }: { games: Game[]; isOwner: boolean; view: 'grid' | 'table' | 'cover'; liveSessions: Map<string, string> }) {
  const today = new Date().toISOString().slice(0, 10)
  const comingSoon = games
    .filter(g => isComingSoon(g, today))
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
  const available = games.filter(g => !isComingSoon(g, today))

  const renderList = (list: Game[], showReleaseDate: boolean) =>
    view === 'table'
      ? <GameTableView games={list} isOwner={isOwner} showReleaseDate={showReleaseDate} />
      : <CardGrid games={list} isOwner={isOwner} cover={view === 'cover'} showReleaseDate={showReleaseDate} liveSessions={liveSessions} />

  return (
    <div className="space-y-8">
      {available.length > 0 && renderList(available, false)}
      {comingSoon.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-fg-base">Coming Soon</h2>
            <span className="text-xs text-fg-subtle font-medium">
              {comingSoon.length} game{comingSoon.length !== 1 ? 's' : ''}
            </span>
          </div>
          {renderList(comingSoon, true)}
        </div>
      )}
    </div>
  )
}

// Total hours played across a year's games, rounded and formatted (null hours ignored).
function totalHours(games: Game[]) {
  return games.reduce((sum, g) => sum + (g.hours_played ?? 0), 0)
}

function hoursLabel(games: Game[]) {
  // Sum the games' hours, then round to 1 decimal so the total matches adding up
  // the per-game hours shown on the cards (and to shed the floating-point tail).
  const hours = Math.round(totalHours(games) * 10) / 10
  if (hours <= 0) return null
  return `${hours.toLocaleString()} hour${hours !== 1 ? 's' : ''} played`
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

function CompletedByYear({ games, isOwner, cover, liveSessions }: { games: Game[]; isOwner: boolean; cover: boolean; liveSessions: Map<string, string> }) {
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
            {hoursLabel(byYear[year]) && (
              <span className="ml-auto text-xs text-fg-subtle font-medium">{hoursLabel(byYear[year])}</span>
            )}
          </div>
          <CardGrid games={byYear[year]} isOwner={isOwner} cover={cover} liveSessions={liveSessions} />
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
  liveSessions = new Map(),
}: {
  games: Game[]
  status: string
  isOwner?: boolean
  view?: 'grid' | 'table' | 'cover'
  // Realistically only ever has entries for the Playing and Ambient tabs —
  // those are the only statuses the agent writes play_sessions for — but
  // threaded through everywhere so no tab has to know that.
  liveSessions?: Map<string, string>
}) {
  if (status === 'backlog') return <BacklogView games={games} isOwner={isOwner} view={view} liveSessions={liveSessions} />

  if (view === 'cover') {
    if (status === 'completed') return <CompletedByYear games={games} isOwner={isOwner} cover liveSessions={liveSessions} />
    return <CardGrid games={games} isOwner={isOwner} cover liveSessions={liveSessions} />
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
                {hoursLabel(byYear[year]) && (
                  <span className="ml-auto text-xs text-fg-subtle font-medium">{hoursLabel(byYear[year])}</span>
                )}
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
    return <CompletedByYear games={games} isOwner={isOwner} cover={false} liveSessions={liveSessions} />
  }

  return <CardGrid games={games} isOwner={isOwner} cover={false} liveSessions={liveSessions} />
}
