/**
 * Turns db/schema.sql (a raw pg_dump of production) into a migration the local
 * Supabase stack can replay.
 *
 * Usage:
 *   npm run db:dump && npm run db:migration
 *
 * Two edits are needed because pg_dump writes output meant for an *empty*
 * cluster, while `supabase db reset` replays into a database Supabase has
 * already provisioned:
 *
 *   - `CREATE SCHEMA public` fails: Postgres ships with it.
 *   - Column defaults call extensions.uuid_generate_v4(), so uuid-ossp has to
 *     exist before the tables are created.
 *
 * Writes supabase/migrations/<timestamp>_init_schema.sql, replacing any
 * previous *_init_schema.sql so repeated runs don't stack up duplicates.
 */

import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const dump = path.join(ROOT, 'db', 'schema.sql')
const migrationsDir = path.join(ROOT, 'supabase', 'migrations')

if (!fs.existsSync(dump)) {
  console.error('db/schema.sql not found — run `npm run db:dump` first.')
  process.exit(1)
}

fs.mkdirSync(migrationsDir, { recursive: true })

for (const existing of fs.readdirSync(migrationsDir).filter(f => f.endsWith('_init_schema.sql'))) {
  fs.unlinkSync(path.join(migrationsDir, existing))
  console.log(`Removed previous ${existing}`)
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const outFile = path.join(migrationsDir, `${stamp}_init_schema.sql`)

const header = [
  '-- Initial schema, generated from the production database.',
  '-- Regenerate with:  npm run db:dump && npm run db:migration',
  '-- Hand edits here will be lost — change production, then re-dump.',
  '',
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',
  '',
  '',
].join('\n')

const body = fs.readFileSync(dump, 'utf8')
  .replace(/^CREATE SCHEMA public;$/m, '-- CREATE SCHEMA public;  (removed: already exists)')

fs.writeFileSync(outFile, header + body)
console.log(`Wrote ${path.relative(ROOT, outFile)}`)
console.log('Apply it with: npx supabase db reset')
