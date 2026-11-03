// Run the master-list import now, rather than waiting for Monday's cron —
// the first import on a new database, or a manual refresh.
//
// It calls the real cron route (/api/cron/sync-detectable) with CRON_SECRET,
// so there is exactly one implementation of the import. Run the site first
// (`npm run dev` for the local stack), and set CRON_SECRET in .env.local.
//
//   node scripts/import-detectable.mjs                          # http://localhost:3000
//   node scripts/import-detectable.mjs https://<your-site>      # a deployed site
//
// Against a deployed site, CRON_SECRET must be *that* site's secret.
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const secret = env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET is not set in .env.local')
  process.exit(1)
}

console.log(`Importing Discord's detectable list via ${base} …`)
const res = await fetch(`${base}/api/cron/sync-detectable`, { headers: { authorization: `Bearer ${secret}` } })
const body = await res.json().catch(() => ({}))
console.log(res.status, body)
process.exit(res.ok ? 0 : 1)
