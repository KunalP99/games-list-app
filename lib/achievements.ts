import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic'
export type AchievementCategory =
  | 'completion'
  | 'hours'
  | 'tickets'
  | 'perfection'
  | 'variety'
  | 'dedication'
  | 'wheel'
  | 'misc'

export type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  rarity: AchievementRarity
  category: AchievementCategory
  xp: number
}

export type UnlockedAchievement = Achievement & { unlocked_at?: string }

export const ACHIEVEMENTS: Achievement[] = [
  // Completion
  { id: 'first_clear',        name: 'First Clear',          description: 'Complete your first game',                   icon: '🎮', rarity: 'common',   category: 'completion', xp: 50  },
  { id: 'five_clears',        name: 'On a Roll',            description: 'Complete 5 games',                           icon: '🎯', rarity: 'common',   category: 'completion', xp: 75  },
  { id: 'ten_clears',         name: 'Seasoned Gamer',       description: 'Complete 10 games',                          icon: '🏅', rarity: 'common',   category: 'completion', xp: 100 },
  { id: 'fifteen_clears',     name: 'Getting Serious',      description: 'Complete 15 games',                          icon: '🎖️', rarity: 'uncommon', category: 'completion', xp: 150 },
  { id: 'twenty_five_clears', name: 'Veteran',              description: 'Complete 25 games',                          icon: '⭐', rarity: 'uncommon', category: 'completion', xp: 200 },
  { id: 'fifty_clears',       name: 'Hall of Famer',        description: 'Complete 50 games',                          icon: '🏆', rarity: 'rare',     category: 'completion', xp: 350 },
  { id: 'seventy_five_clears', name: 'Elite',               description: 'Complete 75 games',                          icon: '🥇', rarity: 'rare',     category: 'completion', xp: 450 },
  { id: 'hundred_clears',     name: 'Century',              description: 'Complete 100 games',                         icon: '💯', rarity: 'epic',     category: 'completion', xp: 600 },
  { id: 'two_hundred_clears', name: 'Unstoppable',          description: 'Complete 200 games',                         icon: '🚀', rarity: 'epic',     category: 'completion', xp: 1000 },
  // Hours
  { id: 'ten_hours',          name: 'Warming Up',           description: 'Log 10 total hours played',                  icon: '⏱️', rarity: 'common',   category: 'hours',      xp: 50  },
  { id: 'fifty_hours',        name: 'Committed',            description: 'Log 50 total hours played',                  icon: '⏰', rarity: 'common',   category: 'hours',      xp: 75  },
  { id: 'hundred_hours',      name: 'Dedicated',            description: 'Log 100 total hours played',                 icon: '🕐', rarity: 'uncommon', category: 'hours',      xp: 150 },
  { id: 'five_hundred_hours', name: 'No Life',              description: 'Log 500 total hours played',                 icon: '😤', rarity: 'rare',     category: 'hours',      xp: 300 },
  { id: 'thousand_hours',     name: 'Legend',               description: 'Log 1,000 total hours played',               icon: '🔥', rarity: 'epic',     category: 'hours',      xp: 500 },
  // Tickets
  { id: 'ten_tickets',        name: 'First Earnings',       description: 'Earn 10 tickets total',                      icon: '🎟️', rarity: 'common',   category: 'tickets',    xp: 50  },
  { id: 'fifty_tickets',      name: 'Getting There',        description: 'Earn 50 tickets total',                      icon: '🎟️', rarity: 'common',   category: 'tickets',    xp: 75  },
  { id: 'hundred_tickets',    name: 'Century Club',         description: 'Earn 100 tickets total',                     icon: '🎟️', rarity: 'uncommon', category: 'tickets',    xp: 150 },
  { id: 'five_hundred_tickets', name: 'Ticket Hoarder',     description: 'Earn 500 tickets total',                     icon: '🎟️', rarity: 'rare',     category: 'tickets',    xp: 300 },
  // Perfection
  { id: 'perfect_completion', name: 'Completionist',        description: '100% a game\'s achievements',                icon: '💎', rarity: 'uncommon', category: 'perfection', xp: 150 },
  { id: 'three_perfect',      name: 'Triple Threat',        description: '100% three games',                           icon: '👑', rarity: 'rare',     category: 'perfection', xp: 300 },
  { id: 'five_perfect',       name: 'Perfectionist',        description: '100% five games',                            icon: '🌟', rarity: 'epic',     category: 'perfection', xp: 500 },
  { id: 'five_rating',        name: 'Standing Ovation',     description: 'Give a game 5/5',                            icon: '⭐', rarity: 'common',   category: 'perfection', xp: 75  },
  { id: 'harsh_critic',       name: 'Brutally Honest',      description: 'Give a game 1/5',                            icon: '💀', rarity: 'common',   category: 'perfection', xp: 50  },
  // Variety
  { id: 'five_genres',        name: 'Genre Explorer',       description: 'Play games across 5 different genres',       icon: '🗺️', rarity: 'common',   category: 'variety',    xp: 75  },
  { id: 'ten_genres',         name: 'Genre Connoisseur',    description: 'Play games across 10 different genres',      icon: '🌍', rarity: 'uncommon', category: 'variety',    xp: 150 },
  { id: 'three_platforms',    name: 'Multiplatform',        description: 'Play on 3 different platforms',              icon: '🖥️', rarity: 'uncommon', category: 'variety',    xp: 100 },
  { id: 'five_platforms',     name: 'Platform Agnostic',    description: 'Play on 5 different platforms',              icon: '🎲', rarity: 'rare',     category: 'variety',    xp: 250 },
  // Dedication
  { id: 'replay_game',        name: 'Round Two',            description: 'Complete a replay',                          icon: '🔄', rarity: 'uncommon', category: 'dedication', xp: 100 },
  { id: 'five_replays',       name: 'Eternal Return',       description: 'Complete 5 replays',                         icon: '♾️', rarity: 'rare',     category: 'dedication', xp: 250 },
  { id: 'sequel_hunter',      name: 'Sequel Hunter',        description: 'Complete a sequel back-to-back',             icon: '📖', rarity: 'uncommon', category: 'dedication', xp: 100 },
  { id: 'ten_favourites',     name: 'Fan Club',             description: 'Mark 10 games as favourite',                 icon: '❤️', rarity: 'uncommon', category: 'dedication', xp: 100 },
  { id: 'marathon',           name: 'The Long Haul',        description: 'Complete a game with 100+ hours',            icon: '🏋️', rarity: 'rare',     category: 'dedication', xp: 250 },
  // Wheel
  { id: 'first_spin',         name: 'Spin to Win',          description: 'Spin the wheel for the first time',          icon: '🎡', rarity: 'common',   category: 'wheel',      xp: 50  },
  { id: 'ten_spins',          name: 'Regular',              description: 'Complete 10 wheel spins',                    icon: '🌀', rarity: 'common',   category: 'wheel',      xp: 75  },
  { id: 'twenty_five_spins',  name: 'Committed Spinner',    description: 'Complete 25 wheel spins',                    icon: '🎰', rarity: 'common',   category: 'wheel',      xp: 100 },
  { id: 'fifty_spins',        name: 'Spin Doctor',          description: 'Complete 50 wheel spins',                    icon: '💫', rarity: 'rare',     category: 'wheel',      xp: 250 },
  { id: 'hundred_spins',      name: 'Wheel Addict',         description: 'Complete 100 wheel spins',                   icon: '🌪️', rarity: 'epic',     category: 'wheel',      xp: 500 },
  { id: 'assigned_complete',  name: 'Obedient',             description: 'Complete a wheel-assigned game',             icon: '✅', rarity: 'uncommon', category: 'wheel',      xp: 100 },
  { id: 'five_assigned',      name: 'Willing Participant',  description: 'Complete 5 wheel-assigned games',            icon: '🤝', rarity: 'rare',     category: 'wheel',      xp: 250 },
  { id: 'ten_assigned',       name: 'True Believer',        description: 'Complete 10 wheel-assigned games',           icon: '🫡', rarity: 'epic',     category: 'wheel',      xp: 500 },
  { id: 'used_reroll',        name: 'Second Opinion',       description: 'Use a Spin & Reroll for the first time',     icon: '🔁', rarity: 'common',   category: 'wheel',      xp: 50  },
  { id: 'skipped_choose',     name: 'Pass',                 description: 'Skip a Choose turn for the first time',      icon: '⏭️', rarity: 'common',   category: 'wheel',      xp: 50  },
  // Misc
  { id: 'backlog_twenty',     name: 'Library Card',         description: 'Have 20 games in your library',              icon: '📚', rarity: 'common',   category: 'misc',       xp: 50  },
  { id: 'backlog_fifty',      name: 'Collector',            description: 'Have 50 games in your library',              icon: '🗄️', rarity: 'uncommon', category: 'misc',       xp: 100 },
  { id: 'dnf_five',           name: 'Selective Taste',      description: 'DNF 5 games',                                icon: '🚪', rarity: 'common',   category: 'misc',       xp: 50  },
]

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  completion: 'Game Completion',
  hours: 'Hours Played',
  tickets: 'Tickets',
  perfection: 'Perfection',
  variety: 'Variety',
  dedication: 'Dedication',
  wheel: 'Wheel',
  misc: 'Misc',
}

// ─── XP / Level helpers ─────────────────────────────────────────────────

// threshold(L) = 50 * L * (L - 1)
export function getLevel(xp: number): number {
  if (xp <= 0) return 1
  // Solve 50 * L * (L - 1) <= xp  →  L = floor((1 + sqrt(1 + 4*xp/50)) / 2)
  const level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2)
  return Math.max(1, level)
}

export function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
}

export function levelProgress(xp: number) {
  const level = getLevel(xp)
  const currentThreshold = xpForLevel(level)
  const nextThreshold = xpForLevel(level + 1)
  const intoLevel = xp - currentThreshold
  const span = nextThreshold - currentThreshold
  return {
    level,
    xp,
    intoLevel,
    span,
    percent: span > 0 ? Math.min(100, Math.round((intoLevel / span) * 100)) : 0,
    nextThreshold,
  }
}

export function gameCompletionXp(hours: number | null, achievementProgress: number | null): number {
  const h = hours ?? 0
  let base: number
  if (h < 20) base = 50
  else if (h < 50) base = 100
  else if (h <= 100) base = 175
  else base = 250 + Math.floor((h - 100) / 10) * 5
  if (achievementProgress === 100) base += 75
  return base
}

// ─── Award core ─────────────────────────────────────────────────────────

const FLASH_COOKIE = 'achievement_unlocks'

type Stats = {
  completedCount: number
  totalHours: number
  ticketsEarnedTotal: number
  perfectGameCount: number
  hasFiveRating: boolean
  hasOneRating: boolean
  uniqueGenres: number
  uniquePlatforms: number
  replayCount: number
  hasSequelComplete: boolean
  favouriteCount: number
  hasMarathonGame: boolean
  totalSpins: number
  assignedCompleteCount: number
  libraryCount: number
  dnfCount: number
  hasUsedReroll: boolean
  hasSkippedChoose: boolean
}

async function gatherStats(supabase: SupabaseClient, userId: string): Promise<Stats> {
  // Single comprehensive query of all the user's games
  const { data: games } = await (supabase.from('games') as any)
    .select('status, hours_played, achievement_progress, rating, genres, platform, is_replay, is_sequel, is_favourite, assigned_by')
    .eq('user_id', userId) as { data: Array<{
      status: string
      hours_played: number | null
      achievement_progress: number | null
      rating: number | null
      genres: string[] | null
      platform: string | null
      is_replay: boolean
      is_sequel: boolean
      is_favourite: boolean
      assigned_by: string | null
    }> | null }

  const list = games ?? []

  const completed = list.filter(g => g.status === 'completed')
  const totalHours = list.reduce((sum, g) => sum + (g.hours_played ?? 0), 0)
  const perfect = completed.filter(g => g.achievement_progress === 100).length
  const fiveRating = list.some(g => g.rating === 5)
  const oneRating = list.some(g => g.rating === 1)

  const genreSet = new Set<string>()
  for (const g of list) {
    if (g.status === 'backlog') continue
    for (const genre of g.genres ?? []) genreSet.add(genre)
  }

  const platformSet = new Set<string>()
  for (const g of list) {
    if (g.status === 'backlog') continue
    if (g.platform) platformSet.add(g.platform)
  }

  const replayCount = completed.filter(g => g.is_replay).length
  const hasSequelComplete = completed.some(g => g.is_sequel)
  const favouriteCount = list.filter(g => g.is_favourite).length
  const hasMarathon = completed.some(g => (g.hours_played ?? 0) >= 100)
  const assignedCompleteCount = completed.filter(g => !!g.assigned_by).length

  // Profile for tickets earned total
  const { data: profile } = await (supabase.from('profiles') as any)
    .select('tickets_earned_total')
    .eq('id', userId)
    .single() as { data: { tickets_earned_total: number } | null }

  // Wheel spins — fetch spin_type to derive reroll/skip usage
  const { data: spinRows } = await (supabase.from('wheel_spins') as any)
    .select('spin_type')
    .eq('user_id', userId) as { data: { spin_type: string }[] | null }

  const spins = spinRows ?? []

  return {
    completedCount: completed.length,
    totalHours,
    ticketsEarnedTotal: profile?.tickets_earned_total ?? 0,
    perfectGameCount: perfect,
    hasFiveRating: fiveRating,
    hasOneRating: oneRating,
    uniqueGenres: genreSet.size,
    uniquePlatforms: platformSet.size,
    replayCount,
    hasSequelComplete,
    favouriteCount,
    hasMarathonGame: hasMarathon,
    totalSpins: spins.length,
    assignedCompleteCount,
    libraryCount: list.length,
    dnfCount: list.filter(g => g.status === 'dnf').length,
    hasUsedReroll: spins.some(s => s.spin_type === 'spin_reroll'),
    hasSkippedChoose: spins.some(s => s.spin_type === 'choose_skip'),
  }
}

function evaluateAchievement(id: string, s: Stats): boolean {
  switch (id) {
    case 'first_clear':          return s.completedCount >= 1
    case 'five_clears':          return s.completedCount >= 5
    case 'ten_clears':           return s.completedCount >= 10
    case 'fifteen_clears':       return s.completedCount >= 15
    case 'twenty_five_clears':   return s.completedCount >= 25
    case 'fifty_clears':         return s.completedCount >= 50
    case 'seventy_five_clears':  return s.completedCount >= 75
    case 'hundred_clears':       return s.completedCount >= 100
    case 'two_hundred_clears':   return s.completedCount >= 200
    case 'ten_hours':           return s.totalHours >= 10
    case 'fifty_hours':         return s.totalHours >= 50
    case 'hundred_hours':       return s.totalHours >= 100
    case 'five_hundred_hours':  return s.totalHours >= 500
    case 'thousand_hours':      return s.totalHours >= 1000
    case 'ten_tickets':         return s.ticketsEarnedTotal >= 10
    case 'fifty_tickets':       return s.ticketsEarnedTotal >= 50
    case 'hundred_tickets':     return s.ticketsEarnedTotal >= 100
    case 'five_hundred_tickets':return s.ticketsEarnedTotal >= 500
    case 'perfect_completion':  return s.perfectGameCount >= 1
    case 'three_perfect':       return s.perfectGameCount >= 3
    case 'five_perfect':        return s.perfectGameCount >= 5
    case 'five_rating':         return s.hasFiveRating
    case 'harsh_critic':        return s.hasOneRating
    case 'five_genres':         return s.uniqueGenres >= 5
    case 'ten_genres':          return s.uniqueGenres >= 10
    case 'three_platforms':     return s.uniquePlatforms >= 3
    case 'five_platforms':      return s.uniquePlatforms >= 5
    case 'replay_game':         return s.replayCount >= 1
    case 'five_replays':        return s.replayCount >= 5
    case 'sequel_hunter':       return s.hasSequelComplete
    case 'ten_favourites':      return s.favouriteCount >= 10
    case 'marathon':            return s.hasMarathonGame
    case 'first_spin':          return s.totalSpins >= 1
    case 'ten_spins':           return s.totalSpins >= 10
    case 'twenty_five_spins':   return s.totalSpins >= 25
    case 'fifty_spins':         return s.totalSpins >= 50
    case 'hundred_spins':       return s.totalSpins >= 100
    case 'assigned_complete':   return s.assignedCompleteCount >= 1
    case 'five_assigned':       return s.assignedCompleteCount >= 5
    case 'ten_assigned':        return s.assignedCompleteCount >= 10
    case 'used_reroll':         return s.hasUsedReroll
    case 'skipped_choose':      return s.hasSkippedChoose
    case 'backlog_twenty':      return s.libraryCount >= 20
    case 'backlog_fifty':       return s.libraryCount >= 50
    case 'dnf_five':            return s.dnfCount >= 5
    default: return false
  }
}

/**
 * Checks all achievement criteria, awards any newly unlocked ones, awards
 * their XP, and stores them in the flash cookie for the layout to pick up.
 * Returns the list of newly unlocked achievements.
 */
export async function checkAndAwardAchievements(
  supabase: SupabaseClient,
  userId: string,
): Promise<UnlockedAchievement[]> {
  // Fetch already-unlocked IDs so we only check what's still locked
  const { data: existing } = await (supabase.from('user_achievements') as any)
    .select('achievement_id')
    .eq('user_id', userId) as { data: { achievement_id: string }[] | null }

  const unlocked = new Set((existing ?? []).map(r => r.achievement_id))
  const stats = await gatherStats(supabase, userId)

  const newlyUnlocked: UnlockedAchievement[] = []

  for (const ach of ACHIEVEMENTS) {
    if (unlocked.has(ach.id)) continue
    if (!evaluateAchievement(ach.id, stats)) continue

    const { error: insertError } = await (supabase.from('user_achievements') as any).insert({
      user_id: userId,
      achievement_id: ach.id,
    })
    if (insertError) continue // unique-constraint conflict or any other error → skip silently

    // Award XP
    await (supabase.rpc as any)('award_xp', {
      p_user_id: userId,
      p_amount: ach.xp,
    })

    newlyUnlocked.push({ ...ach, unlocked_at: new Date().toISOString() })
  }

  if (newlyUnlocked.length > 0) {
    // Append to flash cookie (15s TTL)
    const cookieStore = cookies()
    const existingValue = cookieStore.get(FLASH_COOKIE)?.value
    const existingList: UnlockedAchievement[] = existingValue ? safeParse(existingValue) : []
    cookieStore.set(FLASH_COOKIE, JSON.stringify([...existingList, ...newlyUnlocked]), {
      maxAge: 15,
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    })
  }

  return newlyUnlocked
}

function safeParse(v: string): UnlockedAchievement[] {
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function readFlashAchievements(): UnlockedAchievement[] {
  const cookieStore = cookies()
  const value = cookieStore.get(FLASH_COOKIE)?.value
  return value ? safeParse(value) : []
}
