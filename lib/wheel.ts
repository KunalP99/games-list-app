import type { WheelTurn } from './types'

export function nextWheelTurn(current: WheelTurn): WheelTurn {
  if (current === 'spin') return 'spin_reroll'
  if (current === 'spin_reroll') return 'choose'
  return 'spin'
}

export function pickWinner(games: string[]): string {
  return games[Math.floor(Math.random() * games.length)]
}
