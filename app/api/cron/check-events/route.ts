import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventsToday } from '@/lib/igdb'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Notifies every user when a gaming showcase (IGDB event) is happening today.
// Triggered by Vercel Cron (see vercel.json). Idempotent per event via the
// notified_events table, so an event is only ever announced once.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  // Fail closed: a missing CRON_SECRET must lock these service-role jobs, not open them.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()

  const events = await getEventsToday()
  if (events.length === 0) return NextResponse.json({ ok: true, events: 0, notified: 0 })

  // Which of today's events haven't we announced yet?
  const { data: already } = await sb.from('notified_events').select('event_id').in('event_id', events.map(e => e.id))
  const done = new Set((already ?? []).map((r: { event_id: number }) => Number(r.event_id)))
  const fresh = events.filter(e => !done.has(e.id))
  if (fresh.length === 0) return NextResponse.json({ ok: true, events: events.length, notified: 0 })

  // Announce each new event to every user.
  const { data: users } = await sb.from('profiles').select('id')
  const userIds = (users ?? []).map((u: { id: string }) => u.id)

  const notifications = fresh.flatMap(e =>
    userIds.map(uid => ({
      user_id: uid,
      type: 'event_live',
      title: `${e.name} is live today`,
      body: 'A gaming showcase is happening today.',
      game_id: null,
    })),
  )
  if (notifications.length > 0) {
    const { error } = await sb.from('notifications').insert(notifications)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await sb.from('notified_events').insert(fresh.map(e => ({ event_id: e.id })))

  return NextResponse.json({ ok: true, events: events.length, notified: fresh.length, recipients: userIds.length })
}
