/**
 * Dev-database seeder
 *
 * Fills the *test* Supabase project with fake users and games so new features
 * can be exercised without touching real data.
 *
 * Usage:
 *   npm run seed:dev           # create the test users + games
 *   npm run seed:dev -- --reset  # delete the test users (games cascade) first
 *
 * Refuses to run against the production project — see PROD_REFS below.
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Project refs this script must never touch, whatever .env.local says.
const PROD_REFS = ['msdnrnedrqogvdsmzxxz']

// ── Load .env.local ────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) throw new Error('.env.local not found')
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

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? url
if (PROD_REFS.includes(ref)) {
  console.error(`\n  REFUSING TO RUN: .env.local points at the production project (${ref}).`)
  console.error('  Switch first:  npm run env:dev\n')
  process.exit(1)
}

console.log(`Seeding project: ${ref}`)

const supabase = createClient(url, serviceKey)

// ── Fake data ──────────────────────────────────────────────────────────────────

const USERS = [
  { email: 'test-alex@example.com', password: 'test-password-123', display_name: 'Alex (test)' },
  { email: 'test-sam@example.com', password: 'test-password-123', display_name: 'Sam (test)' },
]

// A spread across every status, with the flags and edge cases worth exercising:
// year-only dates, 100% achievements, >100h (bonus tickets), DNF, unreleased
// backlog ("Coming Soon"), Steam Deck and Emulated flags.
function gamesFor(userId, variant) {
  const base = [
    {
      title: 'Hollow Knight', developer: 'Team Cherry', platform: 'Steam', status: 'completed',
      hours_played: 41.5, rating: 5, achievement_progress: 100,
      completion_date: '2026-03-14', completion_date_precision: 'full',
      release_date: '2017-02-24', release_date_precision: 'full',
      is_favourite: true, steam_deck: true,
    },
    {
      title: 'Chrono Trigger', developer: 'Square', platform: 'SNES', status: 'completed',
      hours_played: 22, rating: 4.5, achievement_progress: null,
      completion_date: '2025-01-01', completion_date_precision: 'year',
      release_date: '1995-03-11', release_date_precision: 'full',
      is_emulated: true,
    },
    {
      title: 'Persona 5 Royal', developer: 'Atlus', platform: 'PS5', status: 'completed',
      hours_played: 132.8, rating: 5, achievement_progress: 78,
      completion_date: '2026-06-02', completion_date_precision: 'full',
      release_date: '2019-10-31', release_date_precision: 'full',
    },
    {
      title: 'Baldur’s Gate 3', developer: 'Larian Studios', platform: 'PC (Windows)', status: 'playing',
      hours_played: 63.2, achievement_progress: 34,
      start_date: '2026-08-01',
      release_date: '2023-08-03', release_date_precision: 'full',
    },
    {
      title: 'Metroid Prime Remastered', developer: 'Retro Studios', platform: 'Nintendo Switch', status: 'playing',
      hours_played: 8.4,
      start_date: '2026-09-01',
      release_date: '2023-02-08', release_date_precision: 'full',
      steam_deck: false,
    },
    {
      title: 'Disco Elysium', developer: 'ZA/UM', platform: 'GOG', status: 'backlog',
      release_date: '2019-10-15', release_date_precision: 'full',
    },
    {
      title: 'Silksong 2', developer: 'Team Cherry', platform: 'Steam', status: 'backlog',
      // Future-dated so it lands in the "Coming Soon" group and is hidden from the wheel.
      release_date: '2027-05-01', release_date_precision: 'full',
    },
    {
      title: 'Starfield', developer: 'Bethesda', platform: 'Xbox Series X/S', status: 'dnf',
      hours_played: 11.3, rating: 2.5,
      completion_date: '2026-02-20', completion_date_precision: 'full',
      review: 'Bounced off it — seeded test data.',
      release_date: '2023-09-06', release_date_precision: 'full',
    },
  ]

  // Give the second user a slightly different library so friend views differ.
  const slice = variant === 0 ? base : base.slice(2).concat([
    {
      title: 'Celeste', developer: 'Maddy Makes Games', platform: 'Steam', status: 'completed',
      hours_played: 14.2, rating: 5, achievement_progress: 100,
      completion_date: '2026-05-09', completion_date_precision: 'full',
      release_date: '2018-01-25', release_date_precision: 'full',
      is_favourite: true,
    },
  ])

  return slice.map(g => ({ user_id: userId, ...g }))
}

// ── Run ────────────────────────────────────────────────────────────────────────

async function findUserByEmail(email) {
  // listUsers is paginated; the dev project is small so one page is plenty.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) throw new Error(`listUsers failed: ${error.message}`)
  return data.users.find(u => u.email === email) ?? null
}

async function reset() {
  console.log('\nResetting seeded users…')
  for (const { email } of USERS) {
    const existing = await findUserByEmail(email)
    if (!existing) { console.log(`  ${email} — not present`); continue }
    const { error } = await supabase.auth.admin.deleteUser(existing.id)
    if (error) throw new Error(`deleteUser(${email}) failed: ${error.message}`)
    console.log(`  ${email} — deleted (profile + games cascade)`)
  }
}

async function seed() {
  console.log('\nSeeding…')
  for (const [i, spec] of USERS.entries()) {
    let user = await findUserByEmail(spec.email)

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: spec.email,
        password: spec.password,
        email_confirm: true,
      })
      if (error) throw new Error(`createUser(${spec.email}) failed: ${error.message}`)
      user = data.user
      console.log(`  created auth user ${spec.email}`)
    } else {
      console.log(`  auth user ${spec.email} already exists`)
    }

    // The handle_new_user trigger creates the profile row; set a friendlier name.
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ display_name: spec.display_name })
      .eq('id', user.id)
    if (profileErr) throw new Error(`profile update failed: ${profileErr.message}`)

    // Replace this user's games so re-running is idempotent.
    const { error: delErr } = await supabase.from('games').delete().eq('user_id', user.id)
    if (delErr) throw new Error(`clearing games failed: ${delErr.message}`)

    // Inserted one at a time on purpose. A PostgREST *bulk* insert takes the
    // union of keys across the array and fills anything a row omits with NULL
    // rather than the column default — so a backlog row with no
    // completion_date_precision would violate that column's NOT NULL
    // constraint. Row-by-row lets Postgres apply defaults normally, and stays
    // correct as columns are added.
    const games = gamesFor(user.id, i)
    for (const game of games) {
      const { error: insErr } = await supabase.from('games').insert(game)
      if (insErr) throw new Error(`inserting "${game.title}" failed: ${insErr.message}`)
    }
    console.log(`  ${spec.email} — ${games.length} games`)
  }
}

try {
  if (process.argv.includes('--reset')) await reset()
  await seed()
  console.log('\nDone. Sign in at http://localhost:3000/login with:')
  for (const u of USERS) console.log(`  ${u.email} / ${u.password}`)
} catch (err) {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
}
