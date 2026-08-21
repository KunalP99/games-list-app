import Link from 'next/link'
import { type ActivityItem, activityVerb, formatActivityDate, getInitials } from '@/lib/activity'

export default function FriendActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div>
      {/* Header — title outside the card */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Friends Activity</h2>
        <Link href="/activity" className="text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 transition-colors">
          View more →
        </Link>
      </div>

      {/* Activity list */}
      <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden divide-y divide-edge-subtle">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: item.accentColour ?? '#7c3aed' }}
            >
              {getInitials(item.displayName)}
            </div>

            {/* Game thumbnail — portrait box art (falls back to the banner) */}
            {(item.gameCoverUrl ?? item.gameImageUrl) && item.type !== 'wheel_spin' && item.type !== 'achievement_unlock' && (
              <img
                src={item.gameCoverUrl ?? item.gameImageUrl}
                alt={item.gameTitle}
                className="w-8 h-11 rounded object-cover shrink-0"
              />
            )}

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-fg-base leading-snug truncate">
                <span className="font-semibold">{item.displayName}</span>
                {' '}
                <span className="text-fg-muted">{activityVerb(item)}</span>
                {item.gameTitle && item.type !== 'wheel_spin' && (
                  <>{' '}<span className="font-medium">{item.gameTitle}</span></>
                )}
                {item.achievementName && (
                  <>{' '}<span className="font-medium">{item.achievementIcon} {item.achievementName}</span></>
                )}
              </p>
              <p className="text-[11px] text-fg-subtle mt-0.5">{formatActivityDate(item.date)}</p>
            </div>

            {/* Right-side rewards */}
            {(item.ticketsEarned != null && item.ticketsEarned > 0) || item.xpEarned != null ? (
              <div className="shrink-0 flex flex-col items-end gap-0.5 text-[11px] font-medium">
                {item.ticketsEarned != null && item.ticketsEarned > 0 && (
                  <span className="text-emerald-500">+{item.ticketsEarned} 🎟️</span>
                )}
                {item.xpEarned != null && (
                  <span style={{ color: item.accentColour ?? 'rgb(var(--brand-500))' }}>+{item.xpEarned} XP</span>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
