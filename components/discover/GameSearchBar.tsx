'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RawgSearchResult } from '@/lib/rawg'

const DEBOUNCE_MS = 300
const MAX_RESULTS = 8

/**
 * The dashboard's game search (public edition, FEATURES.gameStore): searches
 * all of IGDB through the existing rate-limited /api/rawg/search as you type,
 * after a short pause, and opens the picked game's store page
 * (/discover/<igdbId>). Keyboard: ↑ ↓ to move, Enter to open, Esc to close.
 * Games already in your library are marked.
 */
export default function GameSearchBar({ ownedIgdbIds }: { ownedIgdbIds: number[] }) {
  const router = useRouter()
  const listId = useId()
  const owned = new Set(ownedIgdbIds)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RawgSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    const mine = ++seq.current
    if (q.length < 2) { setResults([]); setLoading(false); setError(null); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rawg/search?q=${encodeURIComponent(q)}`)
        const body = await res.json() as { results?: RawgSearchResult[]; error?: string }
        if (mine !== seq.current) return
        setResults((body.results ?? []).slice(0, MAX_RESULTS))
        setError(res.ok ? null : body.error ?? 'Search failed. Please try again.')
        setActive(0)
      } catch {
        if (mine === seq.current) setError('Search failed. Please try again.')
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (r: RawgSearchResult) => { setOpen(false); router.push(`/discover/${r.id}`) }
  const showList = open && query.trim().length >= 2

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!showList || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
  }

  return (
    <div ref={box} className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">Search for a game</label>
      <div className="flex h-12 items-center gap-3 rounded-xl border border-edge-input bg-surface-base px-4 shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-fg-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${listId}-list`}
          aria-activedescendant={showList && results[active] ? `${listId}-opt-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for a game"
          className="min-w-0 flex-1 bg-transparent text-base text-fg-base placeholder:text-fg-subtle focus:outline-none"
        />
        {loading && <span className="text-xs text-fg-muted">Searching…</span>}
      </div>

      {showList && (
        <div className="absolute left-0 right-0 top-14 z-30 rounded-xl border border-edge-base bg-surface-base p-1.5 shadow-xl">
          {error ? (
            <p className="px-3 py-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-fg-muted">{loading ? 'Searching…' : 'No games found by that name.'}</p>
          ) : (
            <ul id={`${listId}-list`} role="listbox" aria-label="Games">
              {results.map((r, i) => {
                const year = r.released?.slice(0, 4)
                const dev = r.developers?.[0]?.name
                return (
                  <li
                    key={r.id}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={e => { e.preventDefault(); go(r) }}
                    className={`flex cursor-pointer items-center gap-3.5 rounded-lg px-2.5 py-2 ${i === active ? 'bg-surface-hover' : ''}`}
                  >
                    <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-surface-sunken">
                      {(r.cover_image ?? r.background_image) && <img src={(r.cover_image ?? r.background_image)!} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-fg-base">{r.name}</span>
                      <span className="block truncate text-[13px] text-fg-muted">{[year, dev].filter(Boolean).join(' · ') || ' '}</span>
                    </span>
                    {owned.has(r.id) && (
                      <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">In your library</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-1 hidden border-t border-edge-subtle px-3 pt-2 pb-1 text-xs text-fg-muted sm:flex gap-4"><span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span></p>
        </div>
      )}
    </div>
  )
}
