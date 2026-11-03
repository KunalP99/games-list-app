import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importDiscordList } from '@/lib/detectable-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Weekly refresh of the master list of detectable games from Discord's list
// (see vercel.json). Fail safe: anything short of a good, full-size list
// leaves the stored snapshot alone — see importDiscordList. Also how the very
// first import is run (scripts/import-detectable.mjs calls this route).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  // Fail closed: a missing CRON_SECRET must lock these service-role jobs, not open them.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const outcome = await importDiscordList(createAdminClient())
  // A rejected/failed run is a handled outcome (recorded, table untouched),
  // not a server error — but a non-2xx makes it visible in Vercel's cron log.
  return NextResponse.json(outcome, { status: outcome.status === 'applied' ? 200 : 502 })
}
