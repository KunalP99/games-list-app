#!/usr/bin/env node
// Switches which Supabase project the local dev server talks to.
//
//   npm run env            -> show which environment is currently active
//   npm run env:dev        -> point .env.local at the dev/test project
//   npm run env:prod       -> point .env.local at the real project
//
// Next.js only ever reads `.env.local`, so this just swaps that file's contents
// from one of two stored sources. Both sources are gitignored (`.env*.local`).
//
//   .env.prod.local  — the real project (created automatically on first run
//                      from whatever `.env.local` held at the time)
//   .env.dev.local   — the local Supabase stack
//
// Copying (rather than layering) is deliberate: whatever is in `.env.local` is
// exactly what runs, so there's no chance of a half-dev/half-prod mix where,
// say, the service-role key still points at real data.
//
// Because it copies, edits you make directly to `.env.local` would be destroyed
// by the next switch — that already cost us a SUPABASE_DB_URL once. So before
// overwriting, the active file is synced *back* to whichever source it came
// from. Only key names are ever printed, never values.

import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const ACTIVE = path.join(ROOT, '.env.local')
const SOURCES = {
  prod: path.join(ROOT, '.env.prod.local'),
  dev: path.join(ROOT, '.env.dev.local'),
}

function refOf(file) {
  if (!fs.existsSync(file)) return null
  const line = fs.readFileSync(file, 'utf8')
    .split('\n')
    .find(l => l.trim().startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  if (!line) return null
  const value = line.split('=')[1]?.trim() || null
  if (value && /127\.0\.0\.1|localhost/.test(value)) return 'local stack'
  const m = line.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)
  return m ? m[1] : value
}

function parseKeys(text) {
  const out = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim())
  }
  return out
}

// Key-name-level summary of what changed. Values are deliberately never shown.
function describeDrift(fromText, toText) {
  const a = parseKeys(fromText)
  const b = parseKeys(toText)
  const added = [...b.keys()].filter(k => !a.has(k))
  const removed = [...a.keys()].filter(k => !b.has(k))
  const changed = [...b.keys()].filter(k => a.has(k) && a.get(k) !== b.get(k))
  return { added, removed, changed, any: added.length + removed.length + changed.length > 0 }
}

function sourceMatching(ref) {
  return Object.entries(SOURCES).find(([, file]) => refOf(file) === ref)
}

function describeActive() {
  const active = refOf(ACTIVE)
  if (!active) {
    console.log('No .env.local found (or it has no NEXT_PUBLIC_SUPABASE_URL).')
    return
  }
  const match = sourceMatching(active)
  const label = match ? match[0].toUpperCase() : 'UNKNOWN'
  console.log(`Active: ${label}  (project ref: ${active})`)

  if (!match) {
    console.log('  ^ .env.local does not match .env.prod.local or .env.dev.local.')
    return
  }

  // Surface unsaved edits here too, so `npm run env` is a real status check.
  const drift = describeDrift(
    fs.readFileSync(match[1], 'utf8'),
    fs.readFileSync(ACTIVE, 'utf8'),
  )
  if (drift.any) {
    console.log(`  Unsaved edits vs ${path.basename(match[1])}:`)
    if (drift.added.length) console.log(`    added:   ${drift.added.join(', ')}`)
    if (drift.changed.length) console.log(`    changed: ${drift.changed.join(', ')}`)
    if (drift.removed.length) console.log(`    removed: ${drift.removed.join(', ')}`)
    console.log('  These are saved back automatically on the next switch.')
  }
}

// Bootstrap: the very first run must not lose the real credentials, which at
// that point exist only in .env.local.
function ensureProdBackup() {
  if (fs.existsSync(SOURCES.prod) || !fs.existsSync(ACTIVE)) return
  fs.copyFileSync(ACTIVE, SOURCES.prod)
  console.log(`Saved your current .env.local to .env.prod.local (ref: ${refOf(SOURCES.prod)})`)
}

// Preserve any edits made directly to .env.local by writing them back to the
// source file they belong to, before that file's contents are replaced.
function syncBackActive() {
  if (!fs.existsSync(ACTIVE)) return

  const activeRef = refOf(ACTIVE)
  const match = sourceMatching(activeRef)

  if (!match) {
    // Belongs to neither source — switching would destroy it with no way back.
    console.error(`Refusing to switch: .env.local (ref: ${activeRef}) does not match`)
    console.error('.env.prod.local or .env.dev.local, so its contents would be lost.')
    console.error('Save it somewhere first, then switch.')
    process.exit(1)
  }

  const [name, file] = match
  const current = fs.readFileSync(ACTIVE, 'utf8')
  const stored = fs.readFileSync(file, 'utf8')
  if (current === stored) return

  const drift = describeDrift(stored, current)
  fs.copyFileSync(ACTIVE, file)
  console.log(`Saved your .env.local edits back to ${path.basename(file)} (${name}):`)
  if (drift.added.length) console.log(`  added:   ${drift.added.join(', ')}`)
  if (drift.changed.length) console.log(`  changed: ${drift.changed.join(', ')}`)
  if (drift.removed.length) console.log(`  removed: ${drift.removed.join(', ')}`)
}

const target = process.argv[2]

if (!target) {
  describeActive()
  process.exit(0)
}

if (!SOURCES[target]) {
  console.error(`Unknown environment "${target}". Use "dev" or "prod".`)
  process.exit(1)
}

ensureProdBackup()

if (!fs.existsSync(SOURCES[target])) {
  console.error(`Missing ${path.basename(SOURCES[target])} — create it first with that project's keys.`)
  process.exit(1)
}

syncBackActive()

fs.copyFileSync(SOURCES[target], ACTIVE)
console.log(`Switched to ${target.toUpperCase()} (project ref: ${refOf(ACTIVE)})`)
console.log('Restart `npm run dev` for it to take effect.')
