export type ActivityItem = {
  type: 'completed' | 'dnf' | 'backlog' | 'playing' | 'wheel_spin' | 'achievement_unlock'
  userId: string
  displayName: string
  username: string
  accentColour: string | null
  gameTitle?: string
  gameImageUrl?: string
  gameId?: string
  wheelResult?: string
  ticketsEarned?: number
  xpEarned?: number
  achievementId?: string
  achievementName?: string
  achievementIcon?: string
  date: string
  isSelf: boolean
}

type RawGame = {
  id: string
  user_id: string
  title: string
  status: string
  image_url: string | null
  completion_date: string | null
  created_at: string
  updated_at: string
  hours_played?: number | null
  achievement_progress?: number | null
}

type RawWheelSpin = {
  id: string
  user_id: string
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
): ActivityItem[] {
  const items: ActivityItem[] = []

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
      items.push({ ...base, type: 'dnf', date: g.updated_at })
    } else if (g.status === 'backlog') {
      items.push({ ...base, type: 'backlog', date: g.created_at })
    } else if (g.status === 'playing') {
      items.push({ ...base, type: 'playing', date: g.created_at })
    }
  }

  for (const spin of wheelSpins) {
    const profile = profiles.get(spin.user_id)
    if (!profile) continue
    items.push({
      type: 'wheel_spin',
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

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function activityVerb(item: ActivityItem): string {
  switch (item.type) {
    case 'completed':          return 'completed'
    case 'dnf':                return "DNF'd"
    case 'backlog':            return 'added to backlog'
    case 'playing':            return 'started playing'
    case 'wheel_spin':         return item.wheelResult ? `spun the wheel → ${item.wheelResult}` : 'spun the wheel'
    case 'achievement_unlock': return 'unlocked'
  }
}

export function formatActivityDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

export function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
