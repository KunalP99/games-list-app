import { createClient } from '@/lib/supabase/server'
import { groupItemsByDay, activityDayHeading } from '@/lib/activity'
import { getActivityFeed } from '@/lib/data/activity-feed'
import ActivityRow from '@/components/activity/ActivityRow'

export default async function ActivityPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const items = await getActivityFeed(supabase, user!.id, 40)
  const days = groupItemsByDay(items)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Recent Activity</h1>
        <p className="mt-1 text-fg-muted text-sm">You and your friends</p>
      </div>

      {items.length === 0 ? (
        <p className="text-fg-subtle text-sm">No recent activity yet.</p>
      ) : (
        // One card per UK day under its own heading, Steam-style.
        <div className="space-y-6">
          {days.map(day => (
            <section key={day.dayKey} className="space-y-2">
              <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">{activityDayHeading(day.dayKey)}</h2>
              <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden divide-y divide-edge-subtle">
                {day.items.map((item, i) => <ActivityRow key={i} item={item} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
