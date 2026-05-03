import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── CSV parsing ────────────────────────────────────────────────────────────────

function parseCSVRow(row: string): string[] {
  const result: string[] = []
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

function parseCSV(raw: string): Record<string, string>[] {
  const cleaned = raw.replace(/^﻿/, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCSVRow(lines[0]).map(h => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

// ── Field mappers ──────────────────────────────────────────────────────────────

// "20 (*3)" = 3 bonus-hour tickets; "OBJ" = objective; otherwise try known labels.
function mapReason(raw: string): string {
  if (!raw) return 'admin_adjustment'
  if (/\d+\s*\(\*\d+\)/.test(raw)) return 'game_completed_bonus_hours'
  if (raw.toUpperCase() === 'OBJ') return 'OBJ'

  const lower = raw.toLowerCase()
  if (lower.includes('short')) return 'game_completed_short'
  if (lower.includes('medium')) return 'game_completed_medium'
  if (lower.includes('long')) return 'game_completed_long'
  if (lower.includes('100%') || lower.includes('achievement')) return 'achievement_100_percent'
  if (lower.includes('sequel')) return 'sequel_back_to_back'
  if (lower.includes('series')) return 'series_back_to_back'
  if (lower.includes('skip') || lower.includes('skipped')) return 'turn_skipped'
  if (lower.includes('reroll')) return 'spin_reroll'
  if (lower.includes('spin')) return 'spin'
  if (lower.includes('choose')) return 'choose_game'

  return raw
}

function parseWheelTurn(raw: string): 'spin' | 'spin_reroll' | 'choose' | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.includes('reroll')) return 'spin_reroll'
  if (lower.includes('spin')) return 'spin'
  if (lower.includes('choose')) return 'choose'
  return null
}

function parseISODate(raw: string): string {
  if (!raw) return new Date().toISOString()
  const d = new Date(raw)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// ── Route handler ──────────────────────────────────────────────────────────────

// POST /api/admin/import-tickets
// Body  : raw CSV text (Content-Type: text/plain or text/csv)
// Auth  : session cookie — only imports rows matching the logged-in user's name
// Usage : curl -b "<cookie>" -X POST --data-binary @tickets.csv \
//           -H "Content-Type: text/plain" http://localhost:3000/api/admin/import-tickets
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, ticket_balance')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const csv = await request.text()
  const allRows = parseCSV(csv)

  // Match against display_name first, then username (case-insensitive)
  const displayName = (profile.display_name ?? '').toLowerCase()
  const username = profile.username.toLowerCase()
  const userRows = allRows.filter(r => {
    const name = (r['Player Name'] ?? '').trim().toLowerCase()
    return name === displayName || name === username
  })

  if (userRows.length === 0) {
    const seen = Array.from(new Set(allRows.map(r => r['Player Name']).filter(Boolean)))
    return NextResponse.json({
      error: `No rows matched player "${profile.display_name ?? profile.username}"`,
      playerNamesInFile: seen,
    }, { status: 400 })
  }

  // Sort chronologically so balance progression is correct
  userRows.sort((a, b) => new Date(a['Date'] ?? 0).getTime() - new Date(b['Date'] ?? 0).getTime())

  // Build a title→id lookup from the user's game library
  const { data: games } = await supabase
    .from('games')
    .select('id, title')
    .eq('user_id', user.id)

  const gameMap = new Map<string, string>()
  for (const g of games ?? []) gameMap.set(g.title.toLowerCase(), g.id)

  const failed: Array<{ entry: string; reason: string }> = []
  let imported = 0
  let finalBalance = profile.ticket_balance

  for (const row of userRows) {
    const gameName = row['Game Name']?.trim() || null
    const amount = parseInt(row['Tickets'] ?? '', 10)
    const newTotal = parseInt(row['New Total'] ?? '', 10)
    const entry = gameName ?? row['Date'] ?? '?'

    if (isNaN(amount) || isNaN(newTotal)) {
      failed.push({ entry, reason: 'Could not parse Tickets or New Total' })
      continue
    }

    const reason = mapReason(row['Reason'] ?? '')
    const wheelTurn = parseWheelTurn(row['Wheel Turn'] ?? '')
    const createdAt = parseISODate(row['Date'] ?? '')
    const gameId = gameName ? (gameMap.get(gameName.toLowerCase()) ?? null) : null

    // balance_before is derivable: newTotal - amount
    const balanceBefore = newTotal - amount

    // Store unmatched game name as a note so the record isn't orphaned
    const note = gameName && !gameId ? `Game: ${gameName}` : null

    const { error } = await supabase
      .from('ticket_transactions')
      .insert({
        user_id: user.id,
        amount,
        reason,
        game_id: gameId,
        wheel_turn_at_time: wheelTurn,
        balance_before: balanceBefore,
        balance_after: newTotal,
        note,
        created_at: createdAt,
      })

    if (error) {
      failed.push({ entry, reason: error.message })
      continue
    }

    imported++
    finalBalance = newTotal
  }

  // Sync the profile balance to whatever the CSV says the final total is
  if (imported > 0) {
    await supabase
      .from('profiles')
      .update({ ticket_balance: finalBalance })
      .eq('id', user.id)
  }

  return NextResponse.json({
    matched: userRows.length,
    imported,
    failed,
    finalBalance,
  })
}
