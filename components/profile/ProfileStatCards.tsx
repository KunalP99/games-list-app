import Link from 'next/link'
import type { ActivityItem } from '@/lib/activity'
import ActivityFeed from './ActivityFeed'

// A full-width two-up row: what they play, and what they've been up to.
// Titles sit outside their boxes, matching the dashboard's section headers
// (see the "Recent Activity"/"Friends" sections in app/(app)/dashboard/page.tsx
// and components/dashboard/FriendActivityFeed.tsx) rather than each card
// owning an internal header.
//
// The genre bars use `accent` as an inline style — their colour, not the
// viewer's, see the note in ProfileHero.tsx. "View more" below uses
// `brand-*` deliberately: it's a navigation control for the viewer, not part
// of the friend's identity, so — like any other link in the app — it follows
// the viewer's own accent.

// How many recent events to show before folding the rest behind "View more".
// Picked to land the card at roughly the same natural height as an 8-row
// genre list, rather than needing to measure and match it.
const ACTIVITY_SHOWN = 4

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      <div className="bg-surface-base border border-edge-base rounded-xl p-4">
        {children}
      </div>
    </div>
  )
}

// One row: a label, a fill bar, and a trailing count.
function Bars({ rows, accent }: { rows: [string, number][]; accent: string }) {
  const max = Math.max(...rows.map(r => r[1]), 1)
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([name, count]) => (
        <div key={name} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-xs text-fg-secondary truncate" title={name}>{name}</div>
          <div className="flex-1 h-2 rounded-full bg-edge-subtle overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: accent }} />
          </div>
          <div className="w-8 text-right text-xs text-fg-muted tabular-nums">{count}</div>
        </div>
      ))}
    </div>
  )
}

export default function ProfileStatCards({
  genreData,
  accent,
  activityItems,
}: {
  genreData: { genre: string; count: number }[]
  accent: string
  activityItems: ActivityItem[]
}) {
  const genreRows: [string, number][] = genreData.slice(0, 8).map(g => [g.genre, g.count])
  const hasTaste = genreRows.length > 0

  return (
    // items-start: CSS Grid stretches row items to match the tallest one by
    // default even with no class asking for it — without this, the shorter
    // card still gets padded out to match the taller one, empty space and all.
    <div className={`grid items-start gap-4 ${hasTaste ? 'md:grid-cols-2' : ''}`}>
      {hasTaste && (
        <Section title="What they play">
          <Bars rows={genreRows} accent={accent} />
        </Section>
      )}

      <Section
        title="Recent Activity"
        action={
          <Link href="/activity" className="text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 transition-colors">
            View more →
          </Link>
        }
      >
        <ActivityFeed items={activityItems.slice(0, ACTIVITY_SHOWN)} />
      </Section>
    </div>
  )
}
