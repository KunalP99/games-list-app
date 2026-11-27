export const GAME_STATUSES = ['backlog', 'playing', 'completed', 'dnf', 'ambient'] as const

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  completed: 'Completed',
  dnf: 'Did Not Finish',
  // Ongoing games outside the wheel — multiplayer, sandbox, anything that is
  // played rather than finished. Added automatically by the desktop agent.
  ambient: 'Ambient',
}

export const WHEEL_TURNS = ['spin', 'spin_reroll', 'choose'] as const

export const WHEEL_TURN_LABELS: Record<string, string> = {
  spin: 'Spin',
  spin_reroll: 'Spin + Reroll',
  choose: 'Choose Game',
}

// Ticket costs (spending)
export const TICKET_COSTS = {
  spin: 3,
  spin_reroll: 6,
  choose_game: 9,
  choose_other_player_game: 100,
} as const

// Ticket awards (earning)
export const TICKET_AWARDS = {
  // Completing a game the wheel picked (lib/tickets.ts calculateCompletionAwards).
  game_completed_short: 1,   // < 20 hours
  game_completed_medium: 2,  // 20–59 hours
  game_completed_long: 3,    // 60–75 hours (and up to 95)
  game_completed_bonus_hours: 1, // per full 20 hours past 75
  // Other games: 1 per 25 hours played (lib/hours-tickets.ts).
  hours_played: 1,
  achievement_100_percent: 3,
  sequel_back_to_back: 1,
  series_back_to_back: 1,
  turn_skipped: 2,
} as const

// Ticket losses
export const TICKET_PENALTIES = {
  assigned_game_incomplete: -5,
} as const

export const WHEEL_MIN_GAMES = 5

export const TICKET_REASON_LABELS: Record<string, string> = {
  game_completed_short: 'Completed a short game (<20 hrs)',
  game_completed_medium: 'Completed a medium game (20–59 hrs)',
  game_completed_long: 'Completed a long game (60+ hrs)',
  game_completed_bonus_hours: 'Bonus: every 20 hrs past 75',
  hours_played: '25 hours played',
  hours_typed: 'Hours played (untracked), paid on completion',
  achievement_100_percent: '100% achievement completion',
  sequel_back_to_back: 'Played sequel back-to-back',
  series_back_to_back: 'Continued series back-to-back',
  turn_skipped: 'Skipped Choose Game turn',
  objective_completed: 'Completed custom objective',
  spin: 'Spin',
  spin_reroll: 'Spin + Reroll',
  choose_game: 'Choose Game',
  choose_other_player_game: "Choose another player's game",
  assigned_game_incomplete: 'Did not complete assigned game',
  objective_incomplete: 'Did not complete custom objective',
  admin_adjustment: 'Manual adjustment',
}
