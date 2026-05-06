import Link from 'next/link'
import { type ActivityItem, activityVerb, formatActivityDate, getInitials } from '@/lib/activity'

export default function FriendActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Friends Activity</p>
        <Link href="/activity" className="text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 transition-colors">
          View more →
        </Link>
      </div>

      {/* Activity list */}
      <div className="divide-y divide-edge-subtle">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
              style={{ backgroundColor: item.accentColour ?? '#7c3aed' }}
            >
              {getInitials(item.displayName)}
            </div>

            {/* Game thumbnail */}
            {item.gameImageUrl && item.type !== 'wheel_spin' && (
              <img
                src={item.gameImageUrl}
                alt={item.gameTitle}
                className="w-8 h-8 rounded object-cover shrink-0 mt-0.5"
              />
            )}

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-fg-base leading-snug">
                <span className="font-semibold">{item.displayName}</span>
                {' '}
                <span className="text-fg-muted">{activityVerb(item)}</span>
                {item.gameTitle && item.type !== 'wheel_spin' && (
                  <>{' '}<span className="font-medium">{item.gameTitle}</span></>
                )}
                {item.achievementName && (
                  <>{' '}<span className="font-medium">{item.achievementIcon} {item.achievementName}</span></>
                )}
                {item.ticketsEarned != null && item.ticketsEarned > 0 && (
                  <span className="text-emerald-500 ml-1">+{item.ticketsEarned} 🎟️</span>
                )}
              </p>
              <p className="text-[11px] text-fg-subtle mt-0.5">{formatActivityDate(item.date)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
