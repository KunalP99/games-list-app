import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getActivityFeed } from '@/lib/data/activity-feed'
import ActivityRow from '@/components/activity/ActivityRow'
import ActivityTabs from './ActivityTabs'
import type { ActivityItem } from '@/lib/activity'

// Ten per tab: enough to fill the column beside the rail without the card
// turning into the full /activity page.
const PER_TAB = 10

function List({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-sm text-fg-subtle">{empty}</p>
  return (
    <div className="-mx-4 divide-y divide-edge-subtle">
      {items.slice(0, PER_TAB).map((item, i) => <ActivityRow key={i} item={item} batchShown={3} />)}
    </div>
  )
}

/**
 * You and your friends' activity in one card, filterable. Same feed and rows
 * as /activity (`getActivityFeed`, `ActivityRow`). Streamed in its own
 * Suspense boundary, since it's the heaviest read on the page.
 */
export default async function ActivityCard({ userId }: { userId: string }) {
  const items = await getActivityFeed(await createClient(), userId, 40)

  return (
    <div className="rounded-2xl bg-surface-base border border-edge-base px-4 pt-4 pb-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-[15px] font-semibold text-fg-base">Activity</h2>
        <Link href="/activity" className="text-xs font-medium text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300">View all →</Link>
      </div>
      <ActivityTabs
        panels={{
          everyone: <List items={items} empty="No recent activity yet." />,
          you: <List items={items.filter(i => i.isSelf)} empty="Nothing from you lately." />,
          friends: <List items={items.filter(i => !i.isSelf)} empty="Your friends have been quiet." />,
        }}
      />
    </div>
  )
}

export function ActivityCardSkeleton() {
  return <div className="h-[36rem] rounded-2xl bg-surface-base border border-edge-base animate-pulse" />
}
