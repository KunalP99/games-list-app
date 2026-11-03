'use client'

import { useState, useRef, useTransition } from 'react'
import { fetchGameSearchPage } from '@/lib/searchGamesClient'
import { addDetectable } from '@/app/(app)/admin/exe-links/actions'
import { isGenericExecutableName } from '@/lib/generic-executable-names'
import type { RawgSearchResult } from '@/lib/rawg'

/**
 * Add a path ending to the master list by hand: the ending, and the exact
 * game it is (picked from a real search result, so it carries an IGDB id).
 */
export default function AddDetectableForm() {
  const [pathSuffix, setPathSuffix] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RawgSearchResult[]>([])
  const [picked, setPicked] = useState<RawgSearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQueryChange(value: string) {
    setQuery(value)
    setPicked(null)
    setSuccess(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const { results } = await fetchGameSearchPage(value.trim(), 1)
      setResults(results)
    }, 300)
  }

  function save() {
    const suffix = pathSuffix.trim()
    if (!suffix || !picked) return
    setError(null)
    startTransition(async () => {
      const res = await addDetectable(suffix, picked.id, picked.name)
      if (!res.success) {
        setError(res.error)
        return
      }
      setSuccess(`"${suffix}" → ${picked.name} added.`)
      setPathSuffix('')
      setQuery('')
      setResults([])
      setPicked(null)
    })
  }

  // A bare generic name ("game.exe") with no folder matches every game that ships one.
  const bare = pathSuffix.trim() && !pathSuffix.includes('/') && !pathSuffix.includes('\\')
  const warnGeneric = bare && isGenericExecutableName(pathSuffix)

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4 space-y-3 max-w-xl">
      <div>
        <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Path ending</label>
        <input
          className="mt-1 w-full rounded-lg border border-edge-base bg-surface-sunken px-3 py-2 text-sm text-fg-base"
          placeholder="tunic/tunic.exe"
          value={pathSuffix}
          onChange={e => setPathSuffix(e.target.value)}
        />
        <p className="mt-1 text-xs text-fg-subtle">
          The exe and its game folder, up to three parts. Matched against the end of the full path on each PC.
        </p>
        {warnGeneric && (
          <p className="mt-1 text-xs text-amber-600">
            A generic name on its own matches every game that ships one — add its folder.
          </p>
        )}
      </div>

      <div className="relative">
        <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Game</label>
        <input
          className="mt-1 w-full rounded-lg border border-edge-base bg-surface-sunken px-3 py-2 text-sm text-fg-base"
          placeholder="Search for the real title…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
        {results.length > 0 && !picked && (
          <ul className="absolute z-10 mt-1 w-full border border-edge-base rounded-lg divide-y divide-edge-subtle bg-surface-base max-h-60 overflow-y-auto shadow-lg">
            {results.map(r => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                  onClick={() => { setPicked(r); setQuery(r.name); setResults([]) }}
                >
                  {(r.cover_image ?? r.background_image) && (
                    <img src={r.cover_image ?? r.background_image!} alt="" className="w-7 h-10 rounded object-cover shrink-0" />
                  )}
                  <span className="text-fg-base">{r.name}{r.released ? ` (${r.released.slice(0, 4)})` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked && (
        <p className="text-sm text-fg-muted">
          Picked: <span className="font-medium text-fg-base">{picked.name}</span> (IGDB id: {picked.id})
        </p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-emerald-500">{success}</p>}

      <button
        type="button"
        disabled={!pathSuffix.trim() || !picked || isPending}
        onClick={save}
        className="px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700 transition-colors"
      >
        {isPending ? 'Saving…' : 'Add to master list'}
      </button>
    </div>
  )
}
