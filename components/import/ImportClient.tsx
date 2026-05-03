'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { bulkImportGames } from '@/app/(app)/import/actions'
import type { CompletedGameRow, BacklogGameRow, ImportResult } from '@/app/(app)/import/actions'

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

// ── Field parsers ──────────────────────────────────────────────────────────────

function parseMoonRating(str: string): number | null {
  if (!str) return null
  const full = (str.match(/🌕/g) ?? []).length
  const half = (str.match(/🌗/g) ?? []).length
  const val = full + half * 0.5
  return val === 0 ? null : Math.min(5, val)
}

function parseDateAndPrecision(str: string): { date: string | null; precision: 'full' | 'year' } {
  const none = { date: null, precision: 'full' as const }
  if (!str) return none
  const trimmed = str.trim()
  // Year only e.g. "2019"
  if (/^\d{4}$/.test(trimmed)) return { date: `${trimmed}-01-01`, precision: 'year' }
  // "Dec 26. 2022" → "Dec 26, 2022"
  const normalized = trimmed.replace(/(\w+)\s+(\d{1,2})\.\s*(\d{4})/, '$1 $2, $3')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return none
  return { date: d.toISOString().slice(0, 10), precision: 'full' }
}

function parseHours(str: string): number | null {
  if (!str) return null
  const val = parseFloat(str.replace(/[^0-9.]/g, ''))
  return isNaN(val) ? null : val
}

function parseAchievements(str: string): number | null {
  if (!str) return null
  const val = parseFloat(str)
  return isNaN(val) ? null : Math.min(100, Math.max(0, val))
}

const LOWERCASE_WORDS = new Set(['a','an','the','and','but','or','nor','for','so','yet','at','by','in','of','on','to','up','as','is'])

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i === 0 || !LOWERCASE_WORDS.has(word)) ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(' ')
}

function parseReleaseYear(str: string): string | null {
  if (!str) return null
  const m = str.match(/\d{4}/)
  return m ? m[0] : null
}

// ── Map CSV rows → typed objects ───────────────────────────────────────────────

function mapCompleted(rows: Record<string, string>[]): CompletedGameRow[] {
  return rows
    .filter(r => r['Name']?.trim())
    .map(r => {
      const { date: completion_date, precision: completion_date_precision } = parseDateAndPrecision(r['Date Completed'] ?? '')
      return {
        title: toTitleCase(r['Name'].trim()),
        release_year: parseReleaseYear(r['Release Date'] ?? r['Yr'] ?? r['Year'] ?? ''),
        developer: r['Developer']?.trim() || null,
        platform: r['Platform']?.trim() || null,
        completion_date,
        completion_date_precision,
        hours_played: parseHours(r['Hours'] ?? ''),
        achievement_progress: parseAchievements(r['Achievements'] || r[''] || ''),
        rating: parseMoonRating(r['Rating'] ?? ''),
        notes: r['Notes']?.trim() || null,
      }
    })
}

function mapBacklog(rows: Record<string, string>[]): BacklogGameRow[] {
  return rows
    .filter(r => r['Name']?.trim())
    .map(r => ({
      title: toTitleCase(r['Name'].trim()),
      platform: r['Platform']?.trim() || null,
    }))
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Textarea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-fg-secondary">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={10}
        className="w-full border border-edge-input rounded-lg px-3 py-2.5 text-xs text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y bg-surface-input font-mono"
      />
    </div>
  )
}

function PreviewTable({ completed, backlog }: { completed: CompletedGameRow[]; backlog: BacklogGameRow[] }) {
  return (
    <div className="space-y-6">
      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
            Completed Games — {completed.length}
          </p>
          <div className="overflow-x-auto rounded-xl border border-edge-base">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-sunken border-b border-edge-subtle">
                  {['Title', 'Release Yr', 'Platform', 'Hours', 'Rating', 'Achievements', 'Completed', 'Notes'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-fg-muted font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {completed.map((g, i) => (
                  <tr key={i} className="hover:bg-surface-hover">
                    <td className="px-3 py-2 text-fg-base font-medium max-w-[180px] truncate">{g.title}</td>
                    <td className="px-3 py-2 text-fg-secondary">{g.release_year ?? <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2 text-fg-secondary">{g.platform ?? <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2 text-fg-secondary">{g.hours_played != null ? `${g.hours_played}h` : <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2 text-fg-secondary">{g.rating != null ? `${g.rating}/5` : <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2 text-fg-secondary">{g.achievement_progress != null ? `${g.achievement_progress}%` : <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2 text-fg-secondary whitespace-nowrap">{g.completion_date ?? <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2 text-fg-muted max-w-[140px] truncate">{g.notes ?? <span className="text-fg-subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {backlog.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
            Backlog — {backlog.length}
          </p>
          <div className="overflow-x-auto rounded-xl border border-edge-base">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-sunken border-b border-edge-subtle">
                  {['Title', 'Platform'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-fg-muted font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {backlog.map((g, i) => (
                  <tr key={i} className="hover:bg-surface-hover">
                    <td className="px-3 py-2 text-fg-base font-medium">{g.title}</td>
                    <td className="px-3 py-2 text-fg-secondary">{g.platform ?? <span className="text-fg-subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

type Step = 'input' | 'preview' | 'done'

export default function ImportClient() {
  const [step, setStep] = useState<Step>('input')
  const [completedCsv, setCompletedCsv] = useState('')
  const [backlogCsv, setBacklogCsv] = useState('')
  const [enrichWithRawg, setEnrichWithRawg] = useState(true)
  const [parsedCompleted, setParsedCompleted] = useState<CompletedGameRow[]>([])
  const [parsedBacklog, setParsedBacklog] = useState<BacklogGameRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handlePreview() {
    setParseError('')
    const completed = mapCompleted(parseCSV(completedCsv))
    const backlog = mapBacklog(parseCSV(backlogCsv))
    if (completed.length === 0 && backlog.length === 0) {
      setParseError('No valid rows found. Make sure the column headers match exactly.')
      return
    }
    setParsedCompleted(completed)
    setParsedBacklog(backlog)
    setStep('preview')
  }

  function handleImport() {
    startTransition(async () => {
      const res = await bulkImportGames(parsedCompleted, parsedBacklog, enrichWithRawg)
      setResult(res)
      setStep('done')
    })
  }

  // ── Step: Input ──────────────────────────────────────────────────────────────
  if (step === 'input') {
    return (
      <div className="space-y-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface-base border border-edge-base rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-fg-base">Completed Games</p>
              <p className="text-xs text-fg-muted mt-0.5">
                Expected columns: <span className="font-mono">Name, Release Date, Developer, Platform, Date Completed, Hours, Achievements, Rating, Notes</span>
              </p>
            </div>
            <Textarea
              label="Paste CSV"
              value={completedCsv}
              onChange={setCompletedCsv}
              placeholder={'Name,Release Date,Developer,Platform,Date Completed,Hours,Achievements,Rating,Notes\n"The Witcher 3","2015","CD Projekt Red","PC","Apr 12, 2023","120","45%","🌕🌕🌕🌕",""'}
            />
          </div>

          <div className="bg-surface-base border border-edge-base rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-fg-base">Backlog</p>
              <p className="text-xs text-fg-muted mt-0.5">
                Expected columns: <span className="font-mono">Name, Platform</span>
              </p>
            </div>
            <Textarea
              label="Paste CSV"
              value={backlogCsv}
              onChange={setBacklogCsv}
              placeholder={'Name,Platform\n"Elden Ring","PS5"\n"Hades","PC"'}
            />
          </div>
        </div>

        <div className="bg-surface-base border border-edge-base rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-fg-base">Options</p>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={enrichWithRawg}
              onChange={e => setEnrichWithRawg(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-edge-input accent-brand-600"
            />
            <div>
              <p className="text-sm font-medium text-fg-secondary group-hover:text-fg-base transition-colors">
                Enrich with RAWG data
              </p>
              <p className="text-xs text-fg-muted mt-0.5">
                Fetches cover images, full release dates, genres, and descriptions for completed and backlog games. Recommended but adds time for large lists.
              </p>
            </div>
          </label>
        </div>

        {parseError && (
          <p className="text-sm text-red-600">{parseError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={!completedCsv.trim() && !backlogCsv.trim()}
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Preview import →
          </button>
          <Link href="/games" className="text-sm text-fg-muted hover:text-fg-secondary transition-colors">
            Cancel
          </Link>
        </div>
      </div>
    )
  }

  // ── Step: Preview ────────────────────────────────────────────────────────────
  if (step === 'preview') {
    const total = parsedCompleted.length + parsedBacklog.length
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="bg-surface-base border border-edge-base rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-fg-base">
              {total} game{total !== 1 ? 's' : ''} ready to import
            </p>
            <p className="text-xs text-fg-muted mt-0.5">
              {parsedCompleted.length} completed · {parsedBacklog.length} backlog
              {enrichWithRawg && ' · RAWG enrichment on'}
            </p>
          </div>
          {enrichWithRawg && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
              ⏱ RAWG enrichment may take ~{Math.ceil((parsedCompleted.length + parsedBacklog.length) * 2 / 4 / 10) * 10}s for {parsedCompleted.length + parsedBacklog.length} games
            </span>
          )}
        </div>

        <PreviewTable completed={parsedCompleted} backlog={parsedBacklog} />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleImport}
            disabled={isPending}
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isPending
              ? `Importing${enrichWithRawg ? ' & enriching' : ''}…`
              : `Import ${total} game${total !== 1 ? 's' : ''}`}
          </button>
          <button
            onClick={() => setStep('input')}
            disabled={isPending}
            className="px-4 py-2.5 border border-edge-base text-fg-secondary text-sm font-medium rounded-lg hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            ← Back
          </button>
          {isPending && (
            <p className="text-xs text-fg-muted animate-pulse">
              {enrichWithRawg ? 'Fetching RAWG data and inserting games, this may take a moment…' : 'Inserting games…'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Step: Done ───────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl shrink-0">{result.failed.length === 0 ? '🎉' : '⚠️'}</span>
            <div>
              <p className="text-lg font-bold text-fg-base">
                {result.imported} game{result.imported !== 1 ? 's' : ''} imported
              </p>
            </div>
          </div>

          {result.failed.length > 0 && (
            <div className="border-t border-edge-subtle pt-4">
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
                Failed ({result.failed.length})
              </p>
              <ul className="space-y-1">
                {result.failed.map((f, i) => (
                  <li key={i} className="text-xs text-red-600">
                    <span className="font-medium">{f.title}</span>
                    <span className="text-red-400 ml-1">— {f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/games"
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
          >
            View my games →
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-fg-muted hover:text-fg-secondary transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return null
}
