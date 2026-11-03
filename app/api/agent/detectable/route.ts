import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { compactList } from '@/lib/detectable'
import { fetchAllDetectable } from '@/lib/detectable-import'

export const dynamic = 'force-dynamic'

/**
 * The master list, for the tracker to match running programs against on the
 * PC itself — so only a *hit* is ever sent to the server, never the list of
 * everything the user runs.
 *
 * `{ version, entries: [[path_suffix, row_id], …] }`, about 11k entries.
 * Where an admin row and a Discord row share an ending, the admin row wins.
 *
 * `version` doubles as the ETag: the latest applied import plus the state of
 * the admin rows. The tracker sends it back as `If-None-Match`, and an
 * unchanged list answers 304 without the list ever being read.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [{ data: run }, { data: latestAdmin, count: adminCount }] = await Promise.all([
    (sb.from('detectable_import_runs') as any)
      .select('id').eq('status', 'applied').order('id', { ascending: false }).limit(1),
    (sb.from('detectable_games') as any)
      .select('updated_at', { count: 'exact' }).eq('source', 'admin').order('updated_at', { ascending: false }).limit(1),
  ])
  const version = [
    run?.[0]?.id ?? 0,
    adminCount ?? 0,
    latestAdmin?.[0]?.updated_at ? Date.parse(latestAdmin[0].updated_at) : 0,
  ].join('-')
  const etag = `"${version}"`

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  let rows
  try {
    rows = await fetchAllDetectable(sb)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'read failed' }, { status: 500 })
  }
  return NextResponse.json({ version, entries: compactList(rows) }, { headers: { ETag: etag } })
}
