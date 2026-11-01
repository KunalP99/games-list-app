/** One member of a stacked row — an achievement, or a game added to backlog. */
export type ActivityBatchEntry = { id: string; label: string; icon?: string }

export type ActivityItem = {
  type: 'completed' | 'dnf' | 'backlog' | 'playing' | 'wheel_spin' | 'game_chosen' | 'choose_skip' | 'achievement_unlock' | 'play_session'
  userId: string
  displayName: string
  username: string
  accentColour: string | null
  gameTitle?: string
  gameImageUrl?: string
  gameCoverUrl?: string
  gameId?: string
  wheelResult?: string
  ticketsEarned?: number
  xpEarned?: number
  achievementId?: string
  achievementName?: string
  achievementIcon?: string
  /**
   * Set only once a `play_session` row has an end time. Its absence (not
   * zero — a session can genuinely end after under a minute) is what tells
   * the UI to show "started playing" instead of "played for Xh Ym": the same
   * row means both, depending on how far along it is. The session's actual
   * tracked minutes, not a value derived from `games.hours_played` — that
   * column is rounded to 0.1h (6-minute steps) for the ticket math, which is
   * coarser than this wants to be.
   */
  sessionMinutes?: number
  /**
   * Every member of a day's batch, set by groupActivityItems. Present on the
   * groupable types (length 1 when there was only one), absent on the rest.
   */
  batch?: ActivityBatchEntry[]
  date: string
  isSelf: boolean
}

type RawGame = {
  id: string
  user_id: string
  title: string
  status: string
  image_url: string | null
  cover_image_url?: string | null
  completion_date: string | null
  created_at: string
  updated_at: string
  hours_played?: number | null
  achievement_progress?: number | null
}

type RawWheelSpin = {
  id: string
  user_id: string
  spin_type: string
  result_name: string | null
  created_at: string
}

export type RawAchievementUnlock = {
  user_id: string
  achievement_id: string
  achievement_name: string
  achievement_icon: string
  xp: number
  unlocked_at: string
}

/**
 * A `play_sessions` row for a Playing or Ambient game — the only two
 * statuses the desktop agent ever tracks hours for. One row covers a whole
 * session, updated in place by the agent's checkpoints — so, unlike every
 * other raw input here, this is the *same* row before and after the event
 * this module turns it into (see `sessionMinutes` above).
 */
export type RawPlaySession = {
  user_id: string
  game_id: string | null
  started_at: string
  ended_at: string | null
  minutes: number
}

/**
 * Drop an in-progress session from the feed unless it's the very first
 * session that (user, game) pair has ever had.
 *
 * Every launch writes its own `play_sessions` row, so without this, each
 * replay of an already-known game re-announced "started playing" —
 * only the actual first time is worth saying that; a finished session
 * always stays regardless, since "played for Xh" is real information worth
 * showing every time, not just once.
 *
 * `history` only needs to cover the (user, game) pairs appearing among
 * `sessions`' in-progress rows — but it must not be the same limited recent
 * window `sessions` itself is, since a long-played game's true first
 * session could sit well outside that window. Pass every session for those
 * specific games instead (cheap: it's scoped to a handful of game ids, not
 * the whole table).
 */
export function suppressRepeatedStarts(
  sessions: RawPlaySession[],
  history: Pick<RawPlaySession, 'user_id' | 'game_id' | 'started_at'>[],
): RawPlaySession[] {
  const firstStartedAt = new Map<string, string>()
  for (const row of history) {
    if (!row.game_id) continue
    const key = `${row.user_id}|${row.game_id}`
    const existing = firstStartedAt.get(key)
    if (!existing || row.started_at < existing) firstStartedAt.set(key, row.started_at)
  }

  return sessions.filter(s => {
    if (s.ended_at != null || !s.game_id) return true
    const first = firstStartedAt.get(`${s.user_id}|${s.game_id}`)
    return first == null || s.started_at <= first
  })
}

type ProfileInfo = {
  displayName: string
  username: string
  accentColour: string | null
}

function completionXp(hours: number | null, achievementProgress: number | null): number {
  const h = hours ?? 0
  let base: number
  if (h < 20) base = 50
  else if (h < 50) base = 100
  else if (h <= 100) base = 175
  else base = 250 + Math.floor((h - 100) / 10) * 5
  if (achievementProgress === 100) base += 75
  return base
}

export function buildActivityItems(
  games: RawGame[],
  wheelSpins: RawWheelSpin[],
  profiles: Map<string, ProfileInfo>,
  ticketsByGame: Record<string, number>,
  currentUserId: string,
  achievementUnlocks: RawAchievementUnlock[] = [],
  playSessions: RawPlaySession[] = [],
): ActivityItem[] {
  const items: ActivityItem[] = []
  const gameById = new Map(games.map(g => [g.id, g]))

  for (const g of games) {
    const profile = profiles.get(g.user_id)
    if (!profile) continue

    const base = {
      userId: g.user_id,
      displayName: profile.displayName,
      username: profile.username,
      accentColour: profile.accentColour,
      gameTitle: g.title,
      gameImageUrl: g.image_url ?? undefined,
      gameCoverUrl: g.cover_image_url ?? undefined,
      gameId: g.id,
      isSelf: g.user_id === currentUserId,
    }

    if (g.status === 'completed') {
      items.push({
        ...base,
        type: 'completed',
        ticketsEarned: ticketsByGame[g.id] ?? undefined,
        xpEarned: completionXp(g.hours_played ?? null, g.achievement_progress ?? null),
        date: g.completion_date ?? g.updated_at,
      })
    } else if (g.status === 'dnf') {
      // Date by the drop date (completion_date); fall back to when it was added
      // rather than last-modified, so an unrelated edit doesn't make it look like
      // the game was just DNF'd.
      items.push({ ...base, type: 'dnf', date: g.completion_date ?? g.created_at })
    } else if (g.status === 'backlog') {
      items.push({ ...base, type: 'backlog', date: g.created_at })
    } else if (g.status === 'playing') {
      items.push({ ...base, type: 'playing', date: g.created_at })
    }
    // Ambient games deliberately produce nothing. They arrive on their own,
    // several at a time, and would drown a feed that is meant to be about the
    // games people chose. They have their own "recently played" strip instead.
  }

  for (const spin of wheelSpins) {
    const profile = profiles.get(spin.user_id)
    if (!profile) continue
    items.push({
      // A 'choose' turn never spins — the player picked directly, so it needs
      // its own wording rather than collapsing into "spun the wheel".
      type: spin.spin_type === 'choose_skip' ? 'choose_skip'
          : spin.spin_type === 'choose'      ? 'game_chosen'
          : 'wheel_spin',
      userId: spin.user_id,
      displayName: profile.displayName,
      username: profile.username,
      accentColour: profile.accentColour,
      wheelResult: spin.result_name ?? undefined,
      date: spin.created_at,
      isSelf: spin.user_id === currentUserId,
    })
  }

  for (const unlock of achievementUnlocks) {
    const profile = profiles.get(unlock.user_id)
    if (!profile) continue
    items.push({
      type: 'achievement_unlock',
      userId: unlock.user_id,
      displayName: profile.displayName,
      username: profile.username,
      accentColour: profile.accentColour,
      achievementId: unlock.achievement_id,
      achievementName: unlock.achievement_name,
      achievementIcon: unlock.achievement_icon,
      xpEarned: unlock.xp,
      date: unlock.unlocked_at,
      isSelf: unlock.user_id === currentUserId,
    })
  }

  // Every session the desktop agent has actually tracked, Playing or
  // Ambient alike — the only two statuses it ever writes to. Ambient games
  // get no entry from the games loop above at all (there's no status change
  // to announce — they just sit there being played), and a Playing game's
  // one-time "started playing" there is about being *assigned* the game
  // (the wheel, a manual add), not about actually sitting down with it —
  // this is that second, real event. Unlike every other source here, one
  // row carries both the start and (once it has one) the end.
  for (const session of playSessions) {
    if (!session.game_id) continue
    const game = gameById.get(session.game_id)
    if (!game || (game.status !== 'ambient' && game.status !== 'playing')) continue
    const profile = profiles.get(session.user_id)
    if (!profile) continue

    const ended = session.ended_at != null
    // A session that never reached a minute isn't worth a "played for 0m"
    // row — most likely someone glancing at a game and closing it again, not
    // a real play. The in-progress "started playing" case is untouched: that
    // fires the moment tracking begins, before there's any duration to judge.
    if (ended && session.minutes < 1) continue
    items.push({
      type: 'play_session',
      userId: session.user_id,
      displayName: profile.displayName,
      username: profile.username,
      accentColour: profile.accentColour,
      gameTitle: game.title,
      gameImageUrl: game.image_url ?? undefined,
      gameCoverUrl: game.cover_image_url ?? undefined,
      gameId: game.id,
      sessionMinutes: ended ? session.minutes : undefined,
      date: ended ? session.ended_at! : session.started_at,
      isSelf: session.user_id === currentUserId,
    })
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/**
 * Activity types that arrive in bursts and are worth stacking: finishing one
 * game can trip five achievements, and a session with the importer or the
 * "+ Backlog" buttons adds a run of games. Left ungrouped, either buries every
 * other kind of activity under a wall of near-identical rows.
 *
 * Completions and wheel spins are deliberately absent — those are the events
 * people actually want to see listed individually.
 */
const GROUPABLE: Partial<Record<ActivityItem['type'], (item: ActivityItem) => ActivityBatchEntry>> = {
  achievement_unlock: item => ({
    id: item.achievementId ?? '',
    label: item.achievementName ?? '',
    icon: item.achievementIcon,
  }),
  backlog: item => ({ id: item.gameId ?? '', label: item.gameTitle ?? '' }),
}

/**
 * Collapse each user's same-day items of a groupable type into one entry.
 *
 * Everything else passes through untouched, and the original order is
 * preserved: a group sits where its most recent member was. Grouping does not
 * depend on adjacency, because two people acting on the same day arrive
 * interleaved by timestamp.
 *
 * Grouping is by UTC day rather than the viewer's local day. Both the feed and
 * Vercel run in UTC, so this matches what the timestamps mean there; the only
 * cost is that a user in another timezone could see a late-evening item
 * grouped with the following day's.
 */
export function groupActivityItems(items: ActivityItem[]): ActivityItem[] {
  const out: ActivityItem[] = []
  const groupIndex = new Map<string, number>()

  for (const item of items) {
    const toEntry = GROUPABLE[item.type]
    if (!toEntry) {
      out.push(item)
      continue
    }
    // Normalise through Date rather than slicing the string: a timestamp
    // carrying a non-UTC offset would otherwise key on the wrong day.
    const day = new Date(item.date)
    const dayKey = isNaN(day.getTime()) ? item.date : day.toISOString().slice(0, 10)
    // Type is part of the key so a day's unlocks and backlog adds stay apart.
    const key = `${item.userId}|${item.type}|${dayKey}`
    const at = groupIndex.get(key)

    if (at == null) {
      groupIndex.set(key, out.length)
      out.push({ ...item, batch: [toEntry(item)] })
      continue
    }
    // Merge into the existing group: keep its (more recent) date and headline,
    // append this one, and total any XP.
    const group = out[at]
    group.batch = [...(group.batch ?? []), toEntry(item)]
    if (item.xpEarned != null) group.xpEarned = (group.xpEarned ?? 0) + item.xpEarned
  }

  return out
}

export function activityVerb(item: ActivityItem): string {
  switch (item.type) {
    case 'completed':          return 'completed'
    case 'dnf':                return "DNF'd"
    case 'backlog':            return 'added to backlog'
    case 'playing':            return 'started playing'
    case 'wheel_spin':         return item.wheelResult ? `spun the wheel → ${item.wheelResult}` : 'spun the wheel'
    case 'game_chosen':        return item.wheelResult ? `chose ${item.wheelResult}` : 'chose a game'
    case 'choose_skip':        return 'skipped a choose game turn'
    case 'achievement_unlock': return 'unlocked'
    case 'play_session':       return item.sessionMinutes != null ? 'played' : 'started playing'
  }
}

/** "45m", "2h", "2h 15m" — minutes only under an hour, hours (+ minutes, if any) past it. */
export function formatSessionDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/**
 * Trailing text after the game title — only `play_session` uses this, for
 * "played <title> for 2h 15m". Everywhere else the title is the end of the
 * sentence, so this is empty.
 */
export function activitySuffix(item: ActivityItem): string {
  if (item.type === 'play_session' && item.sessionMinutes != null) {
    return ` for ${formatSessionDuration(item.sessionMinutes)}`
  }
  return ''
}

export function formatActivityDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  // A negative diff means the date is in the future. Completion dates can no
  // longer be entered that way, but this still guards against any other
  // source of a future timestamp (a clock skew, old data) reading as "Just
  // now" instead of the plain date it actually is.
  if (diffMs < 0) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  if (diffMins < 60) return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

/**
 * Initials for an avatar bubble.
 *
 * Only letters and digits can start an initial, so "Alex (test)" gives "AT"
 * rather than "A(" — a naive split on spaces takes the bracket as the second
 * word's first character. Splits on underscores and hyphens too, since display
 * names are often derived from usernames. Mirrors the logic on the profile
 * pages, which hit this first.
 */
export function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .map(w => w.replace(/^[^0-9A-Za-zÀ-ɏ]+/, '').charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}
