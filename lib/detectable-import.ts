import { parseDiscordList, sanityCheck } from './detectable'

/**
 * Database side of the master list: the weekly import, and reading the whole
 * table back. Pure rules live in `lib/detectable.ts`.
 *
 * `sb` must be a service-role client — none of these tables have RLS policies.
 */

export const DISCORD_LIST_URL = 'https://discord.com/api/v9/applications/detectable'
const FETCH_TIMEOUT_MS = 30_000
const BATCH = 1000
/** A Discord row unseen for this long (four weekly runs) is removed. */
const STALE_AFTER_MS = 28 * 24 * 60 * 60 * 1000

type Sb = { from: (t: string) => any }

export type ImportOutcome = {
  status: 'applied' | 'rejected' | 'failed'
  entries_seen?: number
  rows_upserted?: number
  rows_removed?: number
  note?: string
}

async function record(sb: Sb, outcome: ImportOutcome): Promise<ImportOutcome> {
  const { error } = await sb.from('detectable_import_runs').insert(outcome)
  if (error) console.error(`detectable import: could not record run: ${error.message}`)
  return outcome
}

/**
 * Fetch Discord's list and fold it into `detectable_games`.
 *
 * Fail safe: a failed fetch, an unexpected shape, or a list that fails the
 * sanity gate leaves the table exactly as it was — the stored rows are the
 * snapshot, and a bad week never replaces a good one. Admin rows are never
 * touched. Every run is recorded in `detectable_import_runs`.
 */
export async function importDiscordList(
  sb: Sb,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<ImportOutcome> {
  let json: unknown
  try {
    const res = await fetchImpl(DISCORD_LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' })
    if (!res.ok) return record(sb, { status: 'failed', note: `HTTP ${res.status}` })
    json = await res.json()
  } catch (err) {
    return record(sb, { status: 'failed', note: err instanceof Error ? err.message : String(err) })
  }

  const parsed = parseDiscordList(json)
  if (!parsed.ok) return record(sb, { status: 'rejected', note: parsed.reason })

  const { data: last } = await sb.from('detectable_import_runs')
    .select('rows_upserted')
    .eq('status', 'applied')
    .order('started_at', { ascending: false })
    .limit(1)
  const lastApplied = (last ?? [])[0]?.rows_upserted ?? null
  const gate = sanityCheck(parsed.rows.length, lastApplied)
  if (!gate.ok) {
    return record(sb, { status: 'rejected', entries_seen: parsed.entriesSeen, note: gate.reason })
  }

  const now = new Date(nowMs).toISOString()
  for (let i = 0; i < parsed.rows.length; i += BATCH) {
    const batch = parsed.rows.slice(i, i + BATCH).map(r => ({
      ...r, source: 'discord', last_seen_import: now, updated_at: now,
    }))
    const { error } = await sb.from('detectable_games').upsert(batch, { onConflict: 'source,path_suffix' })
    if (error) {
      return record(sb, {
        status: 'failed', entries_seen: parsed.entriesSeen, rows_upserted: i,
        note: `upsert stopped at row ${i}: ${error.message}`,
      })
    }
  }

  const cutoff = new Date(nowMs - STALE_AFTER_MS).toISOString()
  const { data: removed, error: delErr } = await sb.from('detectable_games')
    .delete()
    .eq('source', 'discord')
    .lt('last_seen_import', cutoff)
    .select('id')
  if (delErr) console.error(`detectable import: could not remove stale rows: ${delErr.message}`)

  return record(sb, {
    status: 'applied',
    entries_seen: parsed.entriesSeen,
    rows_upserted: parsed.rows.length,
    rows_removed: (removed ?? []).length,
    note: parsed.skipped ? `${parsed.skipped} skipped (shared engine exes or ambiguous endings)` : undefined,
  })
}

export type DetectableGameRow = {
  id: number
  path_suffix: string
  source: 'discord' | 'admin'
  name: string
  steam_appid: number | null
  igdb_id: number | null
  discord_id: string | null
  updated_at: string
}

/** Every row, paged past PostgREST's 1,000-row response cap. */
export async function fetchAllDetectable(sb: Sb, columns = 'id, path_suffix, source'): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await sb.from('detectable_games')
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + BATCH - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < BATCH) return out
  }
}
