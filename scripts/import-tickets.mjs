/**
 * Ticket history importer
 *
 * Usage:
 *   node scripts/import-tickets.mjs <path-to-csv>
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Find it in Supabase dashboard → Settings → API → service_role secret
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

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

// ── CSV parsing ────────────────────────────────────────────────────────────────

function parseCSVRow(row) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function parseCSV(raw) {
  const cleaned = raw.replace(/^﻿/, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCSVRow(lines[0]).map(h => h.trim())

  // Tickets column header is a 🎟️ emoji that may be garbled — use index 2 (fixed position)
  const ticketsColIndex = 2

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVRow(line)
    const row = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    row['__tickets'] = (values[ticketsColIndex] ?? '').trim()
    rows.push(row)
  }
  return rows
}

// ── Field parsers ──────────────────────────────────────────────────────────────

// "(34) 29" → 29  |  "29" → 29
function parseNewTotal(str) {
  if (!str) return NaN
  const matches = str.match(/-?\d+/g)
  if (!matches) return NaN
  return parseInt(matches[matches.length - 1], 10)
}

function parseWheelTurn(raw) {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.includes('reroll')) return 'spin_reroll'
  if (lower.includes('spin'))   return 'spin'
  if (lower.includes('choose')) return 'choose'
  return null
}

function parseISODate(raw) {
  if (!raw) return new Date().toISOString()
  const d = new Date(raw)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// Normalize a game title for fuzzy lookup: lowercase + collapse whitespace
function normalizeTitle(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Reason parsing ─────────────────────────────────────────────────────────────
//
// Maps the primary (first) part of a " - " separated reason string to an
// internal reason key. The full original string is stored in the note so
// nothing is lost. One transaction is created per CSV row.

const REASON_MAP = {
  'SKIP': 'turn_skipped',
  'CS':   'game_completed_short',
  'CM':   'game_completed_medium',
  'CL':   'game_completed_long',
  '100%': 'achievement_100_percent',
  'CONT': 'series_back_to_back',
  'DNF':  'assigned_game_incomplete',
  'SP':   'spin',
  'OBJ':  'OBJ',
}

function mapPrimaryReason(raw) {
  if (!raw) return 'admin_adjustment'

  // Use the first " - " segment as the primary reason
  const primary = raw.split(' - ')[0].trim().toUpperCase()

  if (REASON_MAP[primary]) return REASON_MAP[primary]

  // Bonus hours pattern e.g. "20 (*3)"
  if (/\d+\s*\(\*\d+\)/.test(primary)) return 'game_completed_bonus_hours'

  return raw
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find(a => !a.startsWith('--'))
  const debug = args.includes('--debug')

  if (!csvPath) {
    console.error('Usage: node scripts/import-tickets.mjs <path-to-csv> [--debug]')
    process.exit(1)
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`)
    process.exit(1)
  }

  const env = loadEnv()
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY']

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n' +
      'Find your service role key in Supabase dashboard → Settings → API'
    )
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, username, ticket_balance')

  if (profilesError || !profiles?.length) {
    console.error('Could not fetch profiles:', profilesError?.message)
    process.exit(1)
  }

  const csv = fs.readFileSync(csvPath, 'utf8')
  const allRows = parseCSV(csv)

  if (!allRows.length) {
    console.error('No rows found in CSV')
    process.exit(1)
  }

  console.log(`\nFound ${allRows.length} total rows in CSV`)
  const playerNames = [...new Set(allRows.map(r => r['Player Name']).filter(Boolean))]
  console.log('Player names in file:', playerNames.join(', '))

  for (const profile of profiles) {
    const displayName = (profile.display_name ?? '').toLowerCase()
    const username = profile.username.toLowerCase()

    const userRows = allRows.filter(r => {
      const name = (r['Player Name'] ?? '').trim().toLowerCase()
      return name && (name === displayName || name === username)
    })

    if (!userRows.length) {
      console.log(`\n⏭  ${profile.display_name ?? profile.username} — no matching rows, skipping`)
      continue
    }

    userRows.sort((a, b) => new Date(a['Date'] ?? 0).getTime() - new Date(b['Date'] ?? 0).getTime())

    console.log(`\n👤 ${profile.display_name ?? profile.username} (${userRows.length} rows)`)
    console.log(`   Current balance: ${profile.ticket_balance} 🎟️`)

    // Build game lookup: normalizedTitle → id
    const { data: games } = await supabase
      .from('games')
      .select('id, title')
      .eq('user_id', profile.id)

    const gameMap = new Map()
    for (const g of games ?? []) gameMap.set(normalizeTitle(g.title), g.id)

    let imported = 0
    let finalBalance = profile.ticket_balance
    const failed = []

    for (const row of userRows) {
      const gameName  = row['Game Name']?.trim() || null
      const amount    = parseInt(row['__tickets'] ?? '', 10)
      const newTotal  = parseNewTotal(row['New Total'] ?? '')
      const entry     = gameName ?? row['Date'] ?? '?'

      if (isNaN(amount) || isNaN(newTotal)) {
        failed.push({ entry, reason: `Could not parse amount (${row['__tickets']}) or New Total (${row['New Total']})` })
        continue
      }

      const reason    = mapPrimaryReason(row['Reason']?.trim() ?? '')
      const wheelTurn = parseWheelTurn(row['Wheel Turn'] ?? '')
      const createdAt = parseISODate(row['Date'] ?? '')
      const gameId    = gameName ? (gameMap.get(normalizeTitle(gameName)) ?? null) : null

      if (gameName && !gameId) {
        console.log(`   ⚠️  No library match for "${gameName}"`)
        if (debug) {
          const needle = normalizeTitle(gameName)
          console.log(`      Looking for: "${needle}"`)
          const close = [...gameMap.keys()].filter(k => k.includes(needle.slice(0, 10)))
          if (close.length) console.log(`      Similar in library: ${close.map(k => `"${k}"`).join(', ')}`)
          else console.log(`      No similar titles found in library`)
        }
      }

      const note = [
        row['Reason']?.trim(),
        gameName && !gameId ? `Game: ${gameName}` : null,
      ].filter(Boolean).join(' | ') || null

      const { error } = await supabase
        .from('ticket_transactions')
        .insert({
          user_id:            profile.id,
          amount,
          reason,
          game_id:            gameId,
          wheel_turn_at_time: wheelTurn,
          balance_before:     newTotal - amount,
          balance_after:      newTotal,
          note,
          created_at:         createdAt,
        })

      if (error) {
        failed.push({ entry, reason: error.message })
      } else {
        imported++
        finalBalance = newTotal
      }
    }

    if (imported > 0) {
      await supabase
        .from('profiles')
        .update({ ticket_balance: finalBalance })
        .eq('id', profile.id)
    }

    console.log(`   ✅ Imported: ${imported} transactions`)
    if (failed.length) {
      console.log(`   ❌ Failed:   ${failed.length}`)
      for (const f of failed) console.log(`      • ${f.entry}: ${f.reason}`)
    }
    console.log(`   Final balance: ${finalBalance} 🎟️`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
