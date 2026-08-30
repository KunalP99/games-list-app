import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Creates a "game released" notification for backlog games whose release date has
// arrived. Triggered by Vercel Cron (see vercel.json). Idempotent: each game is
// only ever processed once, tracked by games.release_notified.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Backlog games whose release date has passed and haven't been handled yet.
  const { data: candidates, error } = await sb
    .from('games')
    .select('id, user_id, title, release_date, created_at')
    .eq('status', 'backlog')
    .eq('release_notified', false)
    .not('release_date', 'is', null)
    .lte('release_date', today)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (candidates ?? []) as { id: string; user_id: string; title: string; release_date: string; created_at: string }[]
  if (rows.length === 0) return NextResponse.json({ ok: true, processed: 0, notified: 0 })

  // Only notify games that were added while still upcoming (so an already-released
  // game added to the backlog doesn't produce a spurious "out now" alert).
  const toNotify = rows.filter(g => new Date(g.release_date) > new Date(g.created_at))

  if (toNotify.length > 0) {
    const notifications = toNotify.map(g => ({
      user_id: g.user_id,
      type: 'game_released',
      title: `${g.title} is out now`,
      body: 'A game from your backlog just released — time to play?',
      game_id: g.id,
    }))
    const { error: insErr } = await (sb.from('notifications') as any).insert(notifications)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Mark every processed game handled (including skipped already-released ones).
  const ids = rows.map(g => g.id)
  const { error: updErr } = await (sb.from('games') as any).update({ release_notified: true }).in('id', ids)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, processed: rows.length, notified: toNotify.length })
}
