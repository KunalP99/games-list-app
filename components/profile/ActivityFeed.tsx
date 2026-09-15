import { activityVerb, formatActivityDate, type ActivityItem } from '@/lib/activity'

// A compact recap of this one person's recent activity — built on the same
// lib/activity.ts helpers as the full /activity page, but a single-user card
// doesn't need that page's avatar-per-row (it's always the same person), so
// the row here leads with an icon for the event type instead.

const TYPE_ICON: Record<ActivityItem['type'], string> = {
  completed: '✅',
  dnf: '🚫',
  backlog: '📚',
  playing: '🎮',
  wheel_spin: '🎡',
  game_chosen: '🎯',
  choose_skip: '⏭️',
  achievement_unlock: '🏆',
}

function Row({ item }: { item: ActivityItem }) {
  const showGameTitle = item.gameTitle && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && item.type !== 'choose_skip'
  return (
    // py-1.5, not the more common py-2: measured against "What they play"'s
    // real rendered height at its 8-row cap (Playwright getBoundingClientRect,
    // not eyeballed) and tightened until the two cards' boxes land within a
    // pixel of each other at ACTIVITY_SHOWN=4.
    <div className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
      <span className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm bg-surface-sunken">
        {TYPE_ICON[item.type]}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg-secondary truncate">
          <span>{activityVerb(item)}</span>
          {showGameTitle && <> <span className="font-medium text-fg-base">{item.gameTitle}</span></>}
          {item.achievementName && (
            <> <span className="font-medium text-fg-base">{item.achievementIcon} {item.achievementName}</span></>
          )}
        </p>
        <p className="text-xs text-fg-subtle">{formatActivityDate(item.date)}</p>
      </div>

      {(item.ticketsEarned || item.xpEarned != null) && (
        <div className="shrink-0 text-xs font-medium text-right">
          {!!item.ticketsEarned && <div className="text-emerald-500">+{item.ticketsEarned} 🎟️</div>}
          {item.xpEarned != null && <div className="text-fg-muted">+{item.xpEarned} XP</div>}
        </div>
      )}
    </div>
  )
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-fg-subtle">No recent activity yet.</p>
  }

  return (
    <div className="flex flex-col divide-y divide-edge-subtle">
      {items.map((item, i) => (
        <Row key={`${item.type}-${item.date}-${i}`} item={item} />
      ))}
    </div>
  )
}
