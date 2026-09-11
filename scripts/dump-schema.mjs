/**
 * Schema dumper
 *
 * Writes the live database's structure (tables, enums, RLS policies, triggers
 * and — crucially — the Postgres function bodies like `award_tickets`, which
 * exist only inside Supabase and not in this repo) to db/schema.sql.
 *
 * That file is what you replay in a fresh project's SQL editor to stand up an
 * identical empty database. Structure only — no rows are read or written.
 *
 * Usage:
 *   npm run db:dump
 *
 * Requires:
 *   - SUPABASE_DB_URL in .env.prod.local — the Postgres connection string from
 *     Supabase dashboard → Connect → URI (session pooler), with your database
 *     password substituted in. Reading it from a file keeps the password out of
 *     your shell history, and reading specifically from the *prod* file means
 *     this still dumps production while you're switched to the local stack.
 *   - pg_dump. Installed via `winget install PostgreSQL.PostgreSQL.17`. Not the
 *     Supabase CLI's `db dump`, which needs Docker just to run pg_dump for you.
 */

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

// Always read production's credentials, never the active .env.local. The point
// of this script is to capture *production's* schema, and .env.local may well be
// pointed at the local stack — in which case it would dump the local database
// over db/schema.sql, and `npm run db:migration` would then regenerate the
// migrations from it. Circular, and silently wrong.
function loadEnv() {
  const prodPath = path.join(process.cwd(), '.env.prod.local')
  const envPath = fs.existsSync(prodPath)
    ? prodPath
    : path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) throw new Error('.env.prod.local / .env.local not found')
  console.log(`Reading credentials from ${path.basename(envPath)}`)
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

// Supabase hands you a URI with a literal `[YOUR-PASSWORD]` placeholder, and
// generated passwords routinely contain `@`, `^`, `#` and friends. Dropped in
// raw, libpq splits the URI at the wrong `@` and tries to resolve the tail of
// the password as a hostname. Re-encode the password so that can't happen.
// Idempotent: an already-encoded password decodes and re-encodes unchanged.
function normalizeDbUrl(raw) {
  const m = raw.match(/^(postgres(?:ql)?:\/\/)([^:@/]+):(.*)@([^@]+)$/)
  if (!m) return raw
  const [, scheme, user, password, hostAndRest] = m
  let decoded = password
  try {
    decoded = decodeURIComponent(password)
  } catch {
    // Contains a stray '%' that isn't a valid escape — treat it as literal.
  }
  return `${scheme}${user}:${encodeURIComponent(decoded)}@${hostAndRest}`
}

// The EDB installer doesn't add its bin/ to PATH, so check the standard install
// locations (newest major version first) before giving up.
function findPgBin(name) {
  const onPath = spawnSync(`${name} --version`, { shell: true })
  if (onPath.status === 0) return name

  const roots = ['C:/Program Files/PostgreSQL', 'C:/Program Files (x86)/PostgreSQL']
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const versions = fs.readdirSync(root)
      .filter(v => /^\d+$/.test(v))
      .sort((a, b) => Number(b) - Number(a))
    for (const v of versions) {
      const candidate = path.join(root, v, 'bin', `${name}.exe`)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

const env = loadEnv()
const dbUrl = env.SUPABASE_DB_URL && normalizeDbUrl(env.SUPABASE_DB_URL)

if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env.local.')
  console.error('Get it from: Supabase dashboard → Connect → URI (session pooler)')
  process.exit(1)
}

// Belt and braces: refuse to "dump production" from a local connection string.
if (/127\.0\.0\.1|localhost/.test(dbUrl)) {
  console.error('SUPABASE_DB_URL points at a local database, not production.')
  console.error('db/schema.sql is meant to capture production — refusing to overwrite it.')
  process.exit(1)
}

const pgDump = findPgBin('pg_dump')
if (!pgDump) {
  console.error('pg_dump not found. Install it with:')
  console.error('  winget install PostgreSQL.PostgreSQL.17')
  process.exit(1)
}

const outDir = path.join(process.cwd(), 'db')
const outFile = path.join(outDir, 'schema.sql')
fs.mkdirSync(outDir, { recursive: true })

console.log('Dumping schema (structure only)…')

// No shell: the output path contains spaces and the password may contain
// %-escapes, both of which cmd.exe would mangle. Passing argv directly avoids
// any quoting concerns.
const result = spawnSync(
  pgDump,
  [
    dbUrl,
    '--schema-only',
    '--no-owner',        // the new project has different role names
    '--no-privileges',   // ...and its own grants
    '--schema', 'public',
    '--file', outFile,
  ],
  { stdio: 'inherit' },
)

if (result.error) {
  console.error(`\nCould not run pg_dump: ${result.error.message}`)
  process.exit(1)
}

if (result.status !== 0) {
  console.error('\nDump failed. Check that SUPABASE_DB_URL is correct and reachable.')
  console.error('Note: the password in the URL must be percent-encoded (e.g. @ -> %40).')
  process.exit(result.status ?? 1)
}

// pg_dump 17 wraps its output in `\restrict` / `\unrestrict` psql meta-commands.
// The Supabase SQL editor isn't psql and chokes on them, so strip them out —
// they carry no schema information.
{
  const cleaned = fs.readFileSync(outFile, 'utf8')
    .split('\n')
    .filter(l => !/^\\(un)?restrict\b/.test(l))
    .join('\n')
  fs.writeFileSync(outFile, cleaned)
}

// The signup trigger lives on auth.users, outside the public schema, so pg_dump
// skips it — but the app depends on it: without a profile row, AppLayout signs
// the new user straight back out. Fetch any auth-schema triggers that call our
// own functions and append them. (storage/realtime triggers are Supabase
// built-ins that every project already has, so they're deliberately excluded.)
const psql = findPgBin('psql')
if (psql) {
  // `SET search_path = ''` matters: pg_get_triggerdef only schema-qualifies
  // names that aren't already visible. Without it the definition comes back as
  // `EXECUTE FUNCTION handle_new_user()`, which then fails on replay because
  // pg_dump blanks the search_path at the top of its own output.
  const triggerSql = `
    SET search_path = '';
    SELECT pg_get_triggerdef(t.oid) || ';'
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'auth'
      AND p.pronamespace = 'public'::regnamespace;
  `
  const trig = spawnSync(psql, [dbUrl, '-At', '-c', triggerSql], { encoding: 'utf8' })
  // psql echoes a bare "SET" for the search_path command; a lone SET is invalid
  // SQL, so keep only the trigger statements themselves.
  const defs = (trig.stdout ?? '')
    .split('\n')
    .filter(l => l.startsWith('CREATE TRIGGER'))
    .join('\n')
    .trim()
  if (trig.status === 0 && defs) {
    fs.appendFileSync(outFile, [
      '',
      '--',
      '-- Triggers on auth.users (outside the dumped schema, added by scripts/dump-schema.mjs).',
      '-- Required: without this the signup trigger never fires, new users get no',
      '-- profile row, and AppLayout signs them straight back out.',
      '--',
      '',
      defs,
      '',
    ].join('\n'))
    console.log(`Appended ${defs.split('\n').length} auth.users trigger(s).`)
  }
} else {
  console.warn('psql not found — skipped auth.users triggers (signup trigger may be missing).')
}

const lines = fs.readFileSync(outFile, 'utf8').split('\n').length
console.log(`\nWrote ${path.relative(process.cwd(), outFile)} (${lines} lines)`)
console.log('Replay it in the new project: Supabase dashboard → SQL Editor → paste → Run.')
