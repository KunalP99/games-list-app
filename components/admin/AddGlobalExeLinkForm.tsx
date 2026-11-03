'use client'

import { useState, useRef, useTransition } from 'react'
import { fetchGameSearchPage } from '@/lib/searchGamesClient'
import { addGlobalExeLink } from '@/app/(app)/admin/exe-links/actions'
import { isGenericExecutableName } from '@/lib/generic-executable-names'
import type { RawgSearchResult } from '@/lib/rawg'

type Picked = { igdbId: number; title: string; coverImageUrl: string | null }

type Props = {
  /**
   * Present only when editing an existing row: the exe name is then fixed
   * (it's half of the row's real identity, alongside `folderHint`, not
   * something a save can change) and only the game it points at is being
   * re-picked.
   */
  exeName?: string
  /** Fixed alongside `exeName` in edit mode — see above. '' means no hint. */
  folderHint?: string
  /** Current title, shown above the search box in edit mode as a reminder of what's being replaced. */
  currentTitle?: string
  onSaved?: (picked: Picked) => void
  onCancel?: () => void
}

export default function AddGlobalExeLinkForm({ exeName: fixedExeName, folderHint: fixedFolderHint, currentTitle, onSaved, onCancel }: Props) {
  const isEdit = fixedExeName != null
  const [exeName, setExeName] = useState('')
  const [folderHint, setFolderHint] = useState('')
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
    const name = isEdit ? fixedExeName! : exeName.trim()
    const hint = isEdit ? (fixedFolderHint ?? '') : folderHint.trim()
    if (!name || !picked) return
    setError(null)
    startTransition(async () => {
      const coverImageUrl = picked.cover_image ?? picked.background_image ?? null
      const res = await addGlobalExeLink(name, picked.id, picked.name, coverImageUrl, hint)
      if (!res.success) {
        setError(res.error)
        return
      }
      if (isEdit) {
        onSaved?.({ igdbId: picked.id, title: picked.name, coverImageUrl })
        return
      }
      setSuccess(`"${name}"${hint ? ` (in "${hint}")` : ''} → ${picked.name} saved.`)
      setExeName('')
      setFolderHint('')
      setQuery('')
      setResults([])
      setPicked(null)
    })
  }

  const warnGeneric = !isEdit && exeName.trim().length > 0 && isGenericExecutableName(exeName)

  return (
    <div className={isEdit ? 'space-y-3' : 'bg-surface-base border border-edge-base rounded-xl p-4 space-y-3 max-w-xl'}>
      {isEdit ? (
        <p className="text-sm text-fg-base">
          Editing <code className="text-fg-muted">{fixedExeName}</code>
          {fixedFolderHint && <> (in <code className="text-fg-muted">{fixedFolderHint}</code>)</>}
          {currentTitle && <> (currently <span className="font-medium">{currentTitle}</span>)</>}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Executable name</label>
            <input
              className="mt-1 w-full rounded-lg border border-edge-base bg-surface-sunken px-3 py-2 text-sm text-fg-base"
              placeholder="starcitizen.exe"
              value={exeName}
              onChange={e => setExeName(e.target.value)}
            />
            {warnGeneric && (
              <p className="mt-1 text-xs text-amber-600">
                This looks like a generic name many unrelated programs could share — double check before saving.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
              Install folder hint <span className="font-normal text-fg-subtle">(optional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-edge-base bg-surface-sunken px-3 py-2 text-sm text-fg-base"
              placeholder="Only needed if this exe name is already in use for a different game"
              value={folderHint}
              onChange={e => setFolderHint(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="relative">
        <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          {isEdit ? 'Replace with' : 'Game'}
        </label>
        <input
          className="mt-1 w-full rounded-lg border border-edge-base bg-surface-sunken px-3 py-2 text-sm text-fg-base"
          placeholder="Search for the real title…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          autoFocus={isEdit}
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={(!isEdit && !exeName.trim()) || !picked || isPending}
          onClick={save}
          className="px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700 transition-colors"
        >
          {isPending ? 'Saving…' : isEdit ? 'Save change' : 'Save global link'}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-2 text-sm text-fg-muted hover:text-fg-base transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
