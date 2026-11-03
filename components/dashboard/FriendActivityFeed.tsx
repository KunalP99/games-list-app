import Link from 'next/link'
import { type ActivityItem, activityVerb, activitySuffix, activityLiveTag, hasSessionToggle, formatActivityDate, getInitials } from '@/lib/activity'
import ActivityBatchChips from '@/components/activity/ActivityBatchChips'
import { PlaySessions, PlaySessionsToggle, PlaySessionsList } from '@/components/activity/PlaySessionList'

// Two rather than the activity page's three: this card is half-width and a
// denser type scale, so three chips would wrap on ordinary titles.
const BATCH_SHOWN = 2

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
        {items.map((item, i) => {
          // A day's unlocks or backlog adds render as one row: a count in the
          // headline, then chips with the remainder behind "+N more".
          const batch = item.batch ?? []
          const isBatch = batch.length > 1
          const batchNoun = item.type === 'backlog' ? 'games' : 'achievements'

          return (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: item.accentColour ?? '#7c3aed' }}
            >
              {getInitials(item.displayName)}
            </div>

            {/* Game thumbnail — portrait box art (falls back to the banner) */}
            {(item.gameCoverUrl ?? item.gameImageUrl) && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && item.type !== 'achievement_unlock' && (
              <img
                src={item.gameCoverUrl ?? item.gameImageUrl}
                alt={item.gameTitle}
                className="w-8 h-11 rounded object-cover shrink-0"
              />
            )}

            {/* Text */}
            <PlaySessions sessions={item.sessions}>
            <div className="flex-1 min-w-0">
              <p className={`text-xs text-fg-base leading-snug ${hasSessionToggle(item) ? '' : 'truncate'}`}>
                <span className="font-semibold">{item.displayName}</span>
                {' '}
                {/* "added to backlog" reads wrong with a count after it, so a
                    backlog batch splits the verb: "added 4 games to backlog". */}
                <span className="text-fg-muted">
                  {isBatch && item.type === 'backlog' ? 'added' : activityVerb(item)}
                </span>
                {item.gameTitle && !isBatch && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && (
                  <>{' '}<span className="font-medium">{item.gameTitle}</span>{activitySuffix(item)}<PlaySessionsToggle />{activityLiveTag(item)}</>
                )}
                {isBatch && (
                  <>
                    {' '}<span className="font-medium">{batch.length} {batchNoun}</span>
                    {item.type === 'backlog' && <span className="text-fg-muted"> to backlog</span>}
                  </>
                )}
                {!isBatch && item.achievementName && (
                  <>{' '}<span className="font-medium">{item.achievementIcon} {item.achievementName}</span></>
                )}
              </p>

              {isBatch && <ActivityBatchChips entries={batch} shown={BATCH_SHOWN} />}
              <PlaySessionsList />

              <p className="text-[11px] text-fg-subtle mt-0.5">{formatActivityDate(item.date)}</p>
            </div>
            </PlaySessions>

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
          )
        })}
      </div>
    </div>
  )
}
