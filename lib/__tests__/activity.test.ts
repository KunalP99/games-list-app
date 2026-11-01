import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildActivityItems,
  activityVerb,
  activitySuffix,
  formatSessionDuration,
  formatActivityDate,
  getInitials,
  groupActivityItems,
  suppressRepeatedStarts,
  type ActivityItem,
  type RawAchievementUnlock,
  type RawPlaySession,
} from '../activity'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const profiles = new Map([
  ['user-1', { displayName: 'Alice Smith', username: 'alice', accentColour: '#e11d48' }],
  ['user-2', { displayName: 'Bob Jones', username: 'bob', accentColour: null }],
])

const baseGame = {
  id: 'game-1',
  user_id: 'user-1',
  title: 'Elden Ring',
  image_url: 'https://example.com/elden.jpg',
  completion_date: null,
  created_at: '2024-03-01T10:00:00Z',
  updated_at: '2024-03-15T10:00:00Z',
  hours_played: null,
  achievement_progress: null,
}

// ─── getInitials ─────────────────────────────────────────────────────────────

describe('getInitials', () => {
  it('returns initials from a two-word name', () => {
    expect(getInitials('Alice Smith')).toBe('AS')
  })

  it('returns single initial for a one-word name', () => {
    expect(getInitials('Alice')).toBe('A')
  })

  it('only uses first two words for names with more than two parts', () => {
    expect(getInitials('Alice Mary Smith')).toBe('AM')
  })

  it('skips punctuation, so a bracketed name does not give "A("', () => {
    expect(getInitials('Alex (test)')).toBe('AT')
    expect(getInitials('Sam (test)')).toBe('ST')
  })

  it('splits on underscores and hyphens, as usernames often use them', () => {
    expect(getInitials('test-alex')).toBe('TA')
    expect(getInitials('jo_bloggs')).toBe('JB')
  })

  it('falls back to ? when a name has no usable characters', () => {
    expect(getInitials('(((')).toBe('?')
    expect(getInitials('')).toBe('?')
  })

  it('returns uppercase initials', () => {
    expect(getInitials('john doe')).toBe('JD')
  })
})

// ─── activityVerb ────────────────────────────────────────────────────────────

describe('activityVerb', () => {
  const base = {
    userId: 'u', displayName: 'A', username: 'a', accentColour: null, date: '', isSelf: false,
  }

  it('returns "completed" for completed type', () => {
    expect(activityVerb({ ...base, type: 'completed' })).toBe('completed')
  })

  it('returns "DNF\'d" for dnf type', () => {
    expect(activityVerb({ ...base, type: 'dnf' })).toBe("DNF'd")
  })

  it('returns "added to backlog" for backlog type', () => {
    expect(activityVerb({ ...base, type: 'backlog' })).toBe('added to backlog')
  })

  it('returns "started playing" for playing type', () => {
    expect(activityVerb({ ...base, type: 'playing' })).toBe('started playing')
  })

  it('returns spin result when wheel_spin has a result', () => {
    expect(activityVerb({ ...base, type: 'wheel_spin', wheelResult: 'Hades' })).toBe('spun the wheel → Hades')
  })

  it('returns generic spin text when wheel_spin has no result', () => {
    expect(activityVerb({ ...base, type: 'wheel_spin' })).toBe('spun the wheel')
  })

  it('returns "unlocked" for achievement_unlock type', () => {
    expect(activityVerb({ ...base, type: 'achievement_unlock' })).toBe('unlocked')
  })

  it('returns "started playing" for an ambient session with no duration yet', () => {
    expect(activityVerb({ ...base, type: 'play_session' })).toBe('started playing')
  })

  it('returns "played" for an ambient session that has ended', () => {
    expect(activityVerb({ ...base, type: 'play_session', sessionMinutes: 150 })).toBe('played')
  })

  it('treats a 0-minute ended session as ended, not ongoing', () => {
    // sessionMinutes is only absent while the session has no end time — a
    // session that genuinely ended under a minute in must not read as still
    // ongoing.
    expect(activityVerb({ ...base, type: 'play_session', sessionMinutes: 0 })).toBe('played')
  })
})

// ─── formatSessionDuration ──────────────────────────────────────────────────

describe('formatSessionDuration', () => {
  it('shows minutes only under an hour', () => {
    expect(formatSessionDuration(45)).toBe('45m')
    expect(formatSessionDuration(0)).toBe('0m')
  })

  it('shows hours and minutes past an hour', () => {
    expect(formatSessionDuration(135)).toBe('2h 15m')
  })

  it('omits a zero minutes remainder on an exact hour', () => {
    expect(formatSessionDuration(120)).toBe('2h')
  })
})

// ─── activitySuffix ─────────────────────────────────────────────────────────

describe('activitySuffix', () => {
  const base = {
    userId: 'u', displayName: 'A', username: 'a', accentColour: null, date: '', isSelf: false,
  }

  it('is empty while an ambient session is still ongoing', () => {
    expect(activitySuffix({ ...base, type: 'play_session' })).toBe('')
  })

  it('reports the duration once an ambient session has ended', () => {
    expect(activitySuffix({ ...base, type: 'play_session', sessionMinutes: 150 })).toBe(' for 2h 30m')
  })

  it('shows minutes only for a sub-hour session', () => {
    expect(activitySuffix({ ...base, type: 'play_session', sessionMinutes: 45 })).toBe(' for 45m')
  })

  it('is empty for every other type', () => {
    expect(activitySuffix({ ...base, type: 'completed' })).toBe('')
  })
})

// ─── formatActivityDate ───────────────────────────────────────────────────────

describe('formatActivityDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Just now" for 0 minutes ago', () => {
    expect(formatActivityDate('2024-06-15T12:00:00Z')).toBe('Just now')
  })

  it('returns "Just now" for 1 minute ago', () => {
    expect(formatActivityDate('2024-06-15T11:59:00Z')).toBe('Just now')
  })

  it('returns minutes for 30 minutes ago', () => {
    expect(formatActivityDate('2024-06-15T11:30:00Z')).toBe('30m ago')
  })

  it('returns hours for 3 hours ago', () => {
    expect(formatActivityDate('2024-06-15T09:00:00Z')).toBe('3h ago')
  })

  it('returns "Yesterday" for exactly 1 day ago', () => {
    expect(formatActivityDate('2024-06-14T12:00:00Z')).toBe('Yesterday')
  })

  it('shows the plain date, not "Just now", for a date in the future', () => {
    // The actual bug this guards against: a completion date three weeks out
    // produced a negative diff, which `< 60` (minutes) still satisfied, so
    // it read as "Just now" instead of the nonsensical future date it was.
    expect(formatActivityDate('2024-07-05T12:00:00Z')).toBe('5 Jul')
  })

  it('returns days for 5 days ago', () => {
    expect(formatActivityDate('2024-06-10T12:00:00Z')).toBe('5d ago')
  })

  it('returns formatted date for dates older than 7 days (same year)', () => {
    const result = formatActivityDate('2024-01-05T12:00:00Z')
    expect(result).toBe('5 Jan')
  })

  it('includes year for dates in a different year', () => {
    const result = formatActivityDate('2023-03-10T12:00:00Z')
    expect(result).toContain('2023')
  })
})

// ─── buildActivityItems ───────────────────────────────────────────────────────

describe('buildActivityItems', () => {
  it('maps a completed game correctly', () => {
    const game = { ...baseGame, status: 'completed', completion_date: '2024-03-10' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('completed')
    expect(items[0].gameTitle).toBe('Elden Ring')
    expect(items[0].displayName).toBe('Alice Smith')
    expect(items[0].isSelf).toBe(false)
    expect(items[0].date).toBe('2024-03-10')
  })

  it('falls back to updated_at when completion_date is null on a completed game', () => {
    const game = { ...baseGame, status: 'completed', completion_date: null }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].date).toBe(baseGame.updated_at)
  })

  it('maps a dnf game using completion_date (drop date) as date', () => {
    const game = { ...baseGame, status: 'dnf', completion_date: '2024-03-08' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].type).toBe('dnf')
    expect(items[0].date).toBe('2024-03-08')
  })

  it('falls back to created_at (not updated_at) for a dnf game with no drop date', () => {
    const game = { ...baseGame, status: 'dnf', completion_date: null }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].type).toBe('dnf')
    expect(items[0].date).toBe(baseGame.created_at)
  })

  it('maps a backlog game using created_at as date', () => {
    const game = { ...baseGame, status: 'backlog' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].type).toBe('backlog')
    expect(items[0].date).toBe(baseGame.created_at)
  })

  it('maps a playing game using created_at as date', () => {
    const game = { ...baseGame, status: 'playing' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].type).toBe('playing')
    expect(items[0].date).toBe(baseGame.created_at)
  })

  it('sets isSelf true when user_id matches currentUserId', () => {
    const game = { ...baseGame, status: 'completed', completion_date: '2024-03-10' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-1')
    expect(items[0].isSelf).toBe(true)
  })

  it('skips games whose user_id has no matching profile', () => {
    const game = { ...baseGame, user_id: 'unknown-user', status: 'completed', completion_date: '2024-03-10' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items).toHaveLength(0)
  })

  it('attaches ticketsEarned from ticketsByGame', () => {
    const game = { ...baseGame, status: 'completed', completion_date: '2024-03-10' }
    const items = buildActivityItems([game], [], profiles, { 'game-1': 3 }, 'user-2')
    expect(items[0].ticketsEarned).toBe(3)
  })

  it('leaves ticketsEarned undefined when game has no ticket entry', () => {
    const game = { ...baseGame, status: 'completed', completion_date: '2024-03-10' }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].ticketsEarned).toBeUndefined()
  })

  it('calculates xpEarned for a completed game (short game = 50 XP)', () => {
    const game = { ...baseGame, status: 'completed', completion_date: '2024-03-10', hours_played: 10 }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].xpEarned).toBe(50)
  })

  it('calculates xpEarned with 100% achievement bonus (+75)', () => {
    const game = { ...baseGame, status: 'completed', completion_date: '2024-03-10', hours_played: 10, achievement_progress: 100 }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].xpEarned).toBe(125) // 50 + 75
  })

  it('converts null image_url to undefined', () => {
    const game = { ...baseGame, status: 'playing', image_url: null }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2')
    expect(items[0].gameImageUrl).toBeUndefined()
  })

  it('maps wheel spins correctly', () => {
    const spin = { id: 'spin-1', user_id: 'user-1', spin_type: 'spin', result_name: 'Celeste', created_at: '2024-03-20T10:00:00Z' }
    const items = buildActivityItems([], [spin], profiles, {}, 'user-2')
    expect(items[0].type).toBe('wheel_spin')
    expect(items[0].wheelResult).toBe('Celeste')
    expect(items[0].displayName).toBe('Alice Smith')
  })

  it('sets wheelResult to undefined when result_name is null', () => {
    const spin = { id: 'spin-1', user_id: 'user-1', spin_type: 'spin', result_name: null, created_at: '2024-03-20T10:00:00Z' }
    const items = buildActivityItems([], [spin], profiles, {}, 'user-2')
    expect(items[0].wheelResult).toBeUndefined()
  })

  it('skips wheel spins whose user_id has no matching profile', () => {
    const spin = { id: 'spin-1', user_id: 'unknown', spin_type: 'spin', result_name: 'Game', created_at: '2024-03-20T10:00:00Z' }
    const items = buildActivityItems([], [spin], profiles, {}, 'user-2')
    expect(items).toHaveLength(0)
  })

  it('maps achievement unlocks correctly', () => {
    const unlock: RawAchievementUnlock = {
      user_id: 'user-1',
      achievement_id: 'first_clear',
      achievement_name: 'First Clear',
      achievement_icon: '🎮',
      xp: 50,
      unlocked_at: '2024-03-22T10:00:00Z',
    }
    const items = buildActivityItems([], [], profiles, {}, 'user-2', [unlock])
    expect(items[0].type).toBe('achievement_unlock')
    expect(items[0].achievementName).toBe('First Clear')
    expect(items[0].achievementIcon).toBe('🎮')
    expect(items[0].xpEarned).toBe(50)
  })

  it('skips achievement unlocks whose user_id has no matching profile', () => {
    const unlock: RawAchievementUnlock = {
      user_id: 'unknown',
      achievement_id: 'first_clear',
      achievement_name: 'First Clear',
      achievement_icon: '🎮',
      xp: 50,
      unlocked_at: '2024-03-22T10:00:00Z',
    }
    const items = buildActivityItems([], [], profiles, {}, 'user-2', [unlock])
    expect(items).toHaveLength(0)
  })

  it('turns an in-progress ambient session into a "started playing" item', () => {
    const game = { ...baseGame, id: 'amb-1', status: 'ambient' }
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z', ended_at: null, minutes: 0,
    }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('play_session')
    expect(items[0].gameTitle).toBe('Elden Ring')
    expect(items[0].sessionMinutes).toBeUndefined()
    expect(items[0].date).toBe('2024-04-01T10:00:00Z')
  })

  it('turns a finished ambient session into a "played for Xh Ym" item, dated by its end', () => {
    const game = { ...baseGame, id: 'amb-1', status: 'ambient' }
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z', ended_at: '2024-04-01T12:30:00Z', minutes: 150,
    }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
    expect(items[0].sessionMinutes).toBe(150)
    expect(items[0].date).toBe('2024-04-01T12:30:00Z')
  })

  it('drops a finished session under a minute entirely, rather than logging "played for 0m"', () => {
    const game = { ...baseGame, id: 'amb-1', status: 'ambient' }
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z', ended_at: '2024-04-01T10:00:45Z', minutes: 0,
    }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
    expect(items).toHaveLength(0)
  })

  it('still logs a finished session that reaches exactly a minute', () => {
    const game = { ...baseGame, id: 'amb-1', status: 'ambient' }
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z', ended_at: '2024-04-01T10:01:00Z', minutes: 1,
    }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
    expect(items).toHaveLength(1)
    expect(items[0].sessionMinutes).toBe(1)
  })

  it('does not drop an in-progress session just because it has not reached a minute yet', () => {
    const game = { ...baseGame, id: 'amb-1', status: 'ambient' }
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z', ended_at: null, minutes: 0,
    }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
    expect(items).toHaveLength(1)
    expect(items[0].sessionMinutes).toBeUndefined()
  })

  it('also turns a playing-status game\'s session into its own item — not just ambient', () => {
    // A wheel/choose pick is status 'playing', not 'ambient', but the agent
    // tracks its hours exactly the same way, so its sessions earn the same
    // "started playing" / "played for Xh" treatment. This sits alongside
    // the game's own one-time 'playing' item (that one is about being
    // *assigned* the game; this is about actually sitting down with it).
    const game = { ...baseGame, id: 'g-playing', status: 'playing' }
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'g-playing', started_at: '2024-04-01T10:00:00Z', ended_at: null, minutes: 0,
    }
    const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
    expect(items).toHaveLength(2)
    expect(items.map(i => i.type).sort()).toEqual(['play_session', 'playing'])
  })

  it('ignores a play session for a backlog/completed/dnf game', () => {
    // The agent only ever writes hours to a Playing or Ambient game — a
    // session row against anything else would mean the game moved on since,
    // and this isn't live play any more.
    for (const status of ['backlog', 'completed', 'dnf']) {
      const game = { ...baseGame, id: `g-${status}`, status }
      const session: RawPlaySession = {
        user_id: 'user-1', game_id: `g-${status}`, started_at: '2024-04-01T10:00:00Z', ended_at: null, minutes: 0,
      }
      const items = buildActivityItems([game], [], profiles, {}, 'user-2', [], [session])
      expect(items.some(i => i.type === 'play_session')).toBe(false)
    }
  })

  it('ignores a play session whose game cannot be found', () => {
    const session: RawPlaySession = {
      user_id: 'user-1', game_id: 'missing', started_at: '2024-04-01T10:00:00Z', ended_at: null, minutes: 0,
    }
    expect(buildActivityItems([], [], profiles, {}, 'user-2', [], [session])).toHaveLength(0)
  })

  it('sorts all items by date descending', () => {
    const games = [
      { ...baseGame, id: 'g1', status: 'playing', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      { ...baseGame, id: 'g2', status: 'playing', created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' },
    ]
    const items = buildActivityItems(games, [], profiles, {}, 'user-2')
    expect(items[0].date).toBe('2024-03-01T00:00:00Z')
    expect(items[1].date).toBe('2024-01-01T00:00:00Z')
  })

  it('merges games, spins, and achievement unlocks in chronological order', () => {
    const game = { ...baseGame, status: 'playing', created_at: '2024-02-01T00:00:00Z', updated_at: '2024-02-01T00:00:00Z' }
    const spin = { id: 'spin-1', user_id: 'user-1', spin_type: 'spin', result_name: 'Game', created_at: '2024-03-01T00:00:00Z' }
    const unlock: RawAchievementUnlock = {
      user_id: 'user-1', achievement_id: 'x', achievement_name: 'X', achievement_icon: '🏆', xp: 100, unlocked_at: '2024-01-01T00:00:00Z',
    }
    const items = buildActivityItems([game], [spin], profiles, {}, 'user-2', [unlock])
    expect(items.map(i => i.type)).toEqual(['wheel_spin', 'playing', 'achievement_unlock'])
  })

  it('handles empty inputs without throwing', () => {
    expect(() => buildActivityItems([], [], new Map(), {}, 'user-1')).not.toThrow()
  })
})

// ─── XP calculation (via buildActivityItems) ─────────────────────────────────

describe('completion XP calculation', () => {
  const completedGame = (hours: number | null, achievement_progress: number | null = null) => ({
    ...baseGame,
    status: 'completed',
    completion_date: '2024-03-10',
    hours_played: hours,
    achievement_progress,
  })

  it('awards 50 XP for a short game (< 20 hours)', () => {
    const [item] = buildActivityItems([completedGame(10)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(50)
  })

  it('awards 50 XP when hours is null', () => {
    const [item] = buildActivityItems([completedGame(null)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(50)
  })

  it('awards 100 XP for a medium game (20–49 hours)', () => {
    const [item] = buildActivityItems([completedGame(35)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(100)
  })

  it('awards 175 XP for a long game (50–100 hours)', () => {
    const [item] = buildActivityItems([completedGame(75)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(175)
  })

  it('awards 250 XP base for games over 100 hours', () => {
    const [item] = buildActivityItems([completedGame(100)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(175) // exactly 100h is still in the long bracket
  })

  it('adds 5 XP per 10h beyond 100', () => {
    const [item] = buildActivityItems([completedGame(120)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(260) // 250 + (2 * 5)
  })

  it('adds 75 XP bonus for 100% achievement progress', () => {
    const [item] = buildActivityItems([completedGame(10, 100)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(125) // 50 + 75
  })

  it('does not add achievement bonus for 99%', () => {
    const [item] = buildActivityItems([completedGame(10, 99)], [], profiles, {}, 'user-2')
    expect(item.xpEarned).toBe(50)
  })
})

// ─── groupActivityItems ─────────────────────────────────────────────────

const unlock = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  type: 'achievement_unlock',
  userId: 'user-1',
  displayName: 'Alice Smith',
  username: 'alice',
  accentColour: '#e11d48',
  achievementId: 'a1',
  achievementName: 'First Steps',
  achievementIcon: '🥇',
  xpEarned: 10,
  date: '2024-03-15T10:00:00Z',
  isSelf: false,
  ...over,
})

describe('groupActivityItems', () => {
  it('collapses one user\'s unlocks from the same day into a single item', () => {
    const out = groupActivityItems([
      unlock({ achievementId: 'a1', date: '2024-03-15T18:00:00Z' }),
      unlock({ achievementId: 'a2', date: '2024-03-15T12:00:00Z' }),
      unlock({ achievementId: 'a3', date: '2024-03-15T09:00:00Z' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].batch?.map(e => e.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('keeps the most recent timestamp for the group', () => {
    const out = groupActivityItems([
      unlock({ achievementId: 'a1', date: '2024-03-15T18:00:00Z' }),
      unlock({ achievementId: 'a2', date: '2024-03-15T09:00:00Z' }),
    ])
    expect(out[0].date).toBe('2024-03-15T18:00:00Z')
  })

  it('totals the XP across the batch', () => {
    const out = groupActivityItems([
      unlock({ achievementId: 'a1', xpEarned: 10 }),
      unlock({ achievementId: 'a2', xpEarned: 25 }),
      unlock({ achievementId: 'a3', xpEarned: 5 }),
    ])
    expect(out[0].xpEarned).toBe(40)
  })

  it('does not merge across days', () => {
    const out = groupActivityItems([
      unlock({ achievementId: 'a1', date: '2024-03-15T10:00:00Z' }),
      unlock({ achievementId: 'a2', date: '2024-03-14T10:00:00Z' }),
    ])
    expect(out).toHaveLength(2)
  })

  it('does not merge different users on the same day', () => {
    const out = groupActivityItems([
      unlock({ userId: 'user-1', achievementId: 'a1' }),
      unlock({ userId: 'user-2', achievementId: 'a2' }),
    ])
    expect(out).toHaveLength(2)
  })

  it('groups a user\'s unlocks even when another user\'s interleave', () => {
    // The feed is sorted by time, so two people unlocking on the same day
    // arrive interleaved — grouping must not depend on adjacency.
    const out = groupActivityItems([
      unlock({ userId: 'user-1', achievementId: 'a1', date: '2024-03-15T18:00:00Z' }),
      unlock({ userId: 'user-2', achievementId: 'b1', date: '2024-03-15T17:00:00Z' }),
      unlock({ userId: 'user-1', achievementId: 'a2', date: '2024-03-15T16:00:00Z' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].batch?.map(e => e.id)).toEqual(['a1', 'a2'])
    expect(out[1].batch?.map(e => e.id)).toEqual(['b1'])
  })

  it('gives a lone unlock a one-entry list, so the UI has one shape to read', () => {
    const out = groupActivityItems([unlock()])
    expect(out[0].batch).toEqual([{ id: 'a1', label: 'First Steps', icon: '🥇' }])
  })

  it('passes other activity types through untouched and in order', () => {
    const completed: ActivityItem = {
      type: 'completed', userId: 'user-1', displayName: 'Alice Smith', username: 'alice',
      accentColour: '#e11d48', gameTitle: 'Elden Ring', date: '2024-03-15T20:00:00Z', isSelf: false,
    }
    const out = groupActivityItems([
      completed,
      unlock({ achievementId: 'a1' }),
      unlock({ achievementId: 'a2' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(completed)
    expect(out[0].batch).toBeUndefined()
  })

  it('does not mutate the items it was given', () => {
    const a = unlock({ achievementId: 'a1' })
    const b = unlock({ achievementId: 'a2' })
    groupActivityItems([a, b])
    expect(a.batch).toBeUndefined()
    expect(a.xpEarned).toBe(10)
  })

  it('returns an empty list unchanged', () => {
    expect(groupActivityItems([])).toEqual([])
  })
})

// ─── groupActivityItems: backlog adds ────────────────────────────────────────

const backlogAdd = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  type: 'backlog',
  userId: 'user-1',
  displayName: 'Alice Smith',
  username: 'alice',
  accentColour: '#e11d48',
  gameId: 'g1',
  gameTitle: 'Hades',
  date: '2024-03-15T10:00:00Z',
  isSelf: false,
  ...over,
})

describe('groupActivityItems: backlog adds', () => {
  it('stacks a day\'s backlog adds into one item', () => {
    const out = groupActivityItems([
      backlogAdd({ gameId: 'g1', gameTitle: 'Hades', date: '2024-03-15T18:00:00Z' }),
      backlogAdd({ gameId: 'g2', gameTitle: 'Celeste', date: '2024-03-15T17:00:00Z' }),
      backlogAdd({ gameId: 'g3', gameTitle: 'Hollow Knight', date: '2024-03-15T16:00:00Z' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].batch?.map(e => e.label)).toEqual(['Hades', 'Celeste', 'Hollow Knight'])
    expect(out[0].date).toBe('2024-03-15T18:00:00Z')
  })

  it('carries no icon for games, unlike achievements', () => {
    const out = groupActivityItems([backlogAdd()])
    expect(out[0].batch).toEqual([{ id: 'g1', label: 'Hades', icon: undefined }])
  })

  it('keeps backlog adds and achievement unlocks in separate groups', () => {
    // Same user, same day, different kinds of event — stacking them together
    // would read as nonsense ("added 4 games" including an achievement).
    const out = groupActivityItems([
      backlogAdd({ gameId: 'g1', date: '2024-03-15T18:00:00Z' }),
      unlock({ achievementId: 'a1', date: '2024-03-15T17:00:00Z' }),
      backlogAdd({ gameId: 'g2', date: '2024-03-15T16:00:00Z' }),
      unlock({ achievementId: 'a2', date: '2024-03-15T15:00:00Z' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].type).toBe('backlog')
    expect(out[0].batch?.map(e => e.id)).toEqual(['g1', 'g2'])
    expect(out[1].type).toBe('achievement_unlock')
    expect(out[1].batch?.map(e => e.id)).toEqual(['a1', 'a2'])
  })

  it('does not merge backlog adds across days or users', () => {
    expect(groupActivityItems([
      backlogAdd({ gameId: 'g1', date: '2024-03-15T10:00:00Z' }),
      backlogAdd({ gameId: 'g2', date: '2024-03-14T10:00:00Z' }),
    ])).toHaveLength(2)
    expect(groupActivityItems([
      backlogAdd({ userId: 'user-1', gameId: 'g1' }),
      backlogAdd({ userId: 'user-2', gameId: 'g2' }),
    ])).toHaveLength(2)
  })

  it('leaves completions ungrouped — those are worth a row each', () => {
    const completed = (id: string, title: string): ActivityItem => ({
      type: 'completed', userId: 'user-1', displayName: 'Alice Smith', username: 'alice',
      accentColour: '#e11d48', gameId: id, gameTitle: title,
      date: '2024-03-15T10:00:00Z', isSelf: false,
    })
    const out = groupActivityItems([completed('g1', 'Hades'), completed('g2', 'Celeste')])
    expect(out).toHaveLength(2)
    expect(out[0].batch).toBeUndefined()
  })
})

// ─── suppressRepeatedStarts ─────────────────────────────────────────────────

describe('suppressRepeatedStarts', () => {
  const ongoing = (startedAt: string): RawPlaySession =>
    ({ user_id: 'user-1', game_id: 'amb-1', started_at: startedAt, ended_at: null, minutes: 0 })
  const finished = (startedAt: string): RawPlaySession =>
    ({ user_id: 'user-1', game_id: 'amb-1', started_at: startedAt, ended_at: '2024-04-01T12:00:00Z', minutes: 90 })

  it('keeps an in-progress session that really is the first one ever', () => {
    const session = ongoing('2024-04-01T10:00:00Z')
    const history = [{ user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z' }]
    expect(suppressRepeatedStarts([session], history)).toEqual([session])
  })

  it('drops an in-progress session once an earlier one exists for the same game', () => {
    // The actual bug this guards against: every launch writes its own row,
    // so without this a replayed ambient game re-announced "started
    // playing" on every single launch, not just the first.
    const session = ongoing('2024-04-05T10:00:00Z')
    const history = [
      { user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z' }, // the real first session
      { user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-05T10:00:00Z' }, // this one
    ]
    expect(suppressRepeatedStarts([session], history)).toEqual([])
  })

  it('always keeps a finished session, first or not', () => {
    const session = finished('2024-04-05T10:00:00Z')
    const history = [
      { user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z' },
      { user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-05T10:00:00Z' },
    ]
    expect(suppressRepeatedStarts([session], history)).toEqual([session])
  })

  it('does not confuse two different users playing the same game', () => {
    const session: RawPlaySession = { user_id: 'user-2', game_id: 'amb-1', started_at: '2024-04-05T10:00:00Z', ended_at: null, minutes: 0 }
    // Only user-1 has history for this game; user-2's own session is their first.
    const history = [{ user_id: 'user-1', game_id: 'amb-1', started_at: '2024-04-01T10:00:00Z' }]
    expect(suppressRepeatedStarts([session], history)).toEqual([session])
  })

  it('keeps a session with no history at all passed in', () => {
    const session = ongoing('2024-04-01T10:00:00Z')
    expect(suppressRepeatedStarts([session], [])).toEqual([session])
  })
})
