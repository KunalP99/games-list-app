import Link from 'next/link'
import { activityVerb, activitySuffix, activityLiveTag, hasSessionToggle, formatActivityDate, getInitials, type ActivityItem } from '@/lib/activity'
import ActivityBatchChips from '@/components/activity/ActivityBatchChips'
import { PlaySessions, PlaySessionsToggle, PlaySessionsList } from '@/components/activity/PlaySessionList'

/**
 * One row of the activity feed, shared by /activity and the new dashboard's
 * Activity card. `batchShown` is how many members of a day's batch (unlocks,
 * backlog adds) get named before the rest collapse into a "+N" chip.
 */
export default function ActivityRow({ item, batchShown = 3 }: { item: ActivityItem; batchShown?: number }) {
  // A day's worth of unlocks (or backlog adds) renders as one row:
  // a count in the headline, then named chips with the remainder
  // hidden behind +N.
  const batch = item.batch ?? []
  const isBatch = batch.length > 1
  const batchNoun = item.type === 'backlog' ? 'games' : 'achievements'
  // Your own name goes to My Games, which carries your profile
  // banner and stats; a friend's goes to their profile page.
  const profileHref = item.isSelf ? '/games' : `/users/${encodeURIComponent(item.username)}`

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {/* Avatar — links to the same place as the name, since an
          unclickable avatar beside a clickable name is a papercut */}
      <Link
        href={profileHref}
        aria-label={item.isSelf ? 'Your games' : `${item.displayName}'s profile`}
        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white hover:opacity-90 transition-opacity"
        style={{ backgroundColor: item.accentColour ?? '#7c3aed' }}
      >
        {getInitials(item.displayName)}
      </Link>

      {/* Game thumbnail — portrait box art (falls back to the banner) */}
      {(item.gameCoverUrl ?? item.gameImageUrl) && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && item.type !== 'choose_skip' && item.type !== 'achievement_unlock' && (
        <img
          src={item.gameCoverUrl ?? item.gameImageUrl}
          alt={item.gameTitle}
          className="w-9 h-12 rounded object-cover shrink-0"
        />
      )}

      {/* Text */}
      <PlaySessions sessions={item.sessions}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-fg-base leading-snug ${hasSessionToggle(item) ? '' : 'truncate'}`}>
          <Link href={profileHref} className="font-semibold hover:underline">
            {item.isSelf ? 'You' : item.displayName}
          </Link>
          {' '}
          {/* "added to backlog" reads wrong with a count after it,
              so a backlog batch splits the verb around the number:
              "added 4 games to backlog". */}
          <span className="text-fg-muted">
            {isBatch && item.type === 'backlog' ? 'added' : activityVerb(item)}
          </span>
          {item.gameTitle && !isBatch && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && item.type !== 'choose_skip' && (
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

        {isBatch && <ActivityBatchChips entries={batch} shown={batchShown} />}
        <PlaySessionsList />

        <p className="text-xs text-fg-subtle mt-0.5">{formatActivityDate(item.date)}</p>
      </div>
      </PlaySessions>

      {/* Right-side rewards */}
      {(item.ticketsEarned != null && item.ticketsEarned > 0) || item.xpEarned != null ? (
        <div className="shrink-0 flex flex-col items-end gap-0.5 text-xs font-medium">
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
}
