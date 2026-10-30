// Fill games.steam_appid from IGDB, so the desktop agent can match a running
// Steam game to a library row without an API call per check.
//
// Reads whichever database .env.local currently points at, and prints it before
// doing anything. Writing to production is the normal case here (the column is
// derived data, not user content), but it must be deliberate: pass --yes.
//
//   node scripts/backfill-steam-appids.mjs          # dry run, shows what it would do
//   node scripts/backfill-steam-appids.mjs --yes    # actually write
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

const WRITE = process.argv.includes('--yes')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const isLocal = url.includes('127.0.0.1') || url.includes('localhost')

console.log(`Target: ${url} ${isLocal ? '(local stack)' : '(PRODUCTION)'}`)
console.log(WRITE ? 'Mode:   writing\n' : 'Mode:   dry run (pass --yes to write)\n')

const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY)

// ── IGDB ────────────────────────────────────────────────────────────────────
const tokenRes = await fetch(
  `https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
  { method: 'POST' },
)
const { access_token: token } = await tokenRes.json()
if (!token) { console.error('Could not get an IGDB token — check IGDB_CLIENT_ID/SECRET'); process.exit(1) }

async function igdb(body) {
  await new Promise(r => setTimeout(r, 300)) // IGDB allows 4 req/sec
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${token}` },
    body,
  })
  if (!res.ok) { console.error(`IGDB ${res.status}: ${await res.text()}`); return [] }
  return res.json()
}

// Same rule as steamAppIdFrom in lib/igdb.ts: external_game_source 1 is Steam,
// and a game carries many external ids in arbitrary order, so filter — never
// take the first.
function steamAppIdFrom(external) {
  for (const e of external ?? []) {
    if (e.external_game_source !== 1 || !e.uid) continue
    const n = Number(e.uid)
    if (Number.isInteger(n) && n > 0) return n
  }
  return null
}

// ── Work ────────────────────────────────────────────────────────────────────
const { data: games, error } = await db
  .from('games')
  .select('id, title, igdb_id, steam_appid')
  .not('igdb_id', 'is', null)
  .is('steam_appid', null)
if (error) { console.error(error.message); process.exit(1) }

console.log(`${games.length} games need a Steam app id.`)
if (games.length === 0) process.exit(0)

const byIgdb = new Map()
for (const g of games) {
  if (!byIgdb.has(g.igdb_id)) byIgdb.set(g.igdb_id, [])
  byIgdb.get(g.igdb_id).push(g)
}

const ids = [...byIgdb.keys()]
const resolved = new Map()
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50)
  const rows = await igdb(
    `fields name, external_games.uid, external_games.external_game_source; where id = (${batch.join(',')}); limit 50;`)
  for (const row of rows) {
    const appId = steamAppIdFrom(row.external_games)
    if (appId) resolved.set(row.id, appId)
  }
  console.log(`  batch ${i / 50 + 1}/${Math.ceil(ids.length / 50)} — ${resolved.size} resolved so far`)
}

let written = 0, noSteam = 0
for (const [igdbId, rows] of byIgdb) {
  const appId = resolved.get(igdbId)
  if (!appId) { noSteam += rows.length; continue }
  for (const g of rows) {
    if (WRITE) {
      const { error: e } = await db.from('games').update({ steam_appid: appId }).eq('id', g.id)
      if (e) { console.error(`  ! ${g.title}: ${e.message}`); continue }
    }
    written++
  }
}

console.log(`\n${WRITE ? 'Updated' : 'Would update'}: ${written}`)
console.log(`No Steam release on IGDB:   ${noSteam}`)
