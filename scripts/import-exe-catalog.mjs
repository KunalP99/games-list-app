// Bulk-import exe -> game title mappings into global_exe_links, from a text
// export shaped like:
//
//   Game Title
//     📂 install folder name
//       💾 exe.exe
//
// A title can have several 📂 blocks (different install layouts), each with
// its own 💾 exes; an exe directly under the title (no 📂 at all) gets no
// folder hint. Re-runnable and additive: every imported row uses
// `source: 'import'` and `ON CONFLICT (exe_name, folder_hint) DO NOTHING`, so
// it never overwrites a row an admin has reviewed on /admin/exe-links, and
// running it again with an updated list only adds what's new.
//
// `igdb_id` is deliberately left null here — resolving 50k+ titles against
// IGDB up front isn't worth the quota; each row resolves itself (and caches
// the result) the first time any user's agent actually looks it up
// (app/api/agent/identify's lookupExe path).
//
// Reads whichever database .env.local currently points at, and prints it
// before doing anything. Writing to production is the normal case here (the
// whole point is a shared catalog), but it must be deliberate: pass --yes.
//
//   node scripts/import-exe-catalog.mjs [path-to-list.txt]          # dry run
//   node scripts/import-exe-catalog.mjs [path-to-list.txt] --yes    # write
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

const WRITE = process.argv.includes('--yes')
const listPath = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'scripts/data/master-games-list.txt'
const url = env.NEXT_PUBLIC_SUPABASE_URL
const isLocal = url.includes('127.0.0.1') || url.includes('localhost')

console.log(`Target: ${url} ${isLocal ? '(local stack)' : '(PRODUCTION)'}`)
console.log(`Source: ${listPath}`)
console.log(WRITE ? 'Mode:   writing\n' : 'Mode:   dry run (pass --yes to write)\n')

const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY)

// ── Parse ───────────────────────────────────────────────────────────────────
const raw = readFileSync(listPath, 'utf8')
const lines = raw.split(/\r?\n/)

let currentTitle = null
let currentFolder = '' // '' means "no hint"
/** key: `${exeName}\u0000${folderHint}` -> title. A Map dedupes for free. */
const rows = new Map()

for (const line of lines) {
  if (line.trim() === '') continue
  const indented = /^\s/.test(line)
  const trimmed = line.trim()

  if (!indented) {
    currentTitle = trimmed
    currentFolder = ''
    continue
  }
  if (trimmed.startsWith('📂')) {
    currentFolder = trimmed.replace(/^📂\s*/, '').trim().toLowerCase()
    continue
  }
  if (trimmed.startsWith('💾')) {
    if (!currentTitle) continue
    const exeName = trimmed.replace(/^💾\s*/, '').trim().toLowerCase()
    if (!exeName) continue
    const key = `${exeName}\u0000${currentFolder}`
    if (!rows.has(key)) rows.set(key, { exe_name: exeName, folder_hint: currentFolder, title: currentTitle })
  }
}

const parsed = [...rows.values()]
console.log(`Parsed ${parsed.length} distinct (exe, folder) pairs from ${lines.length} lines.`)

if (parsed.length === 0) {
  console.log('Nothing to do.')
} else if (WRITE) {
  let inserted = 0
  const BATCH = 1000
  for (let i = 0; i < parsed.length; i += BATCH) {
    const batch = parsed.slice(i, i + BATCH).map(r => ({ ...r, source: 'import' }))
    const { error, count } = await db
      .from('global_exe_links')
      .upsert(batch, { onConflict: 'exe_name,folder_hint', ignoreDuplicates: true, count: 'exact' })
    if (error) {
      console.error(`  ! batch ${i / BATCH + 1}: ${error.message}`)
      continue
    }
    inserted += count ?? 0
    console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(parsed.length / BATCH)} done`)
  }
  console.log(`\nDone. New rows actually inserted (duplicates skipped): ~${inserted}`)
} else {
  console.log('Would upsert all of the above. Re-run with --yes to write.')
}
