'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { searchUsers, type SearchResult } from '@/app/(app)/friends/actions'
import { searchTerm } from '@/lib/friends'
import PersonAvatar from './PersonAvatar'
import RelationButton from './RelationButton'

const DEBOUNCE_MS = 300

/**
 * Find people by username or display name and send them a request, from the
 * dashboard Friends card's "+". Private profiles still show up (their name and
 * an Add friend button; nothing else until they accept).
 */
export default function AddFriendModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only the newest search's answer counts: a slow older one must not land
  // on top of it (the same guard as the username field's live check).
  const seq = useRef(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const term = searchTerm(query)
    const mine = ++seq.current
    if (!term) { setResults(null); setLoading(false); setError(null); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await searchUsers(term)
        if (mine !== seq.current) return
        if (r.success) { setResults(r.data); setError(null) }
        else setError(r.error)
      } catch {
        if (mine === seq.current) setError('Search failed. Please try again.')
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[12vh] sm:pt-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal aria-labelledby="add-friend-title" className="relative w-full max-w-md bg-surface-base border border-edge-base rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-friend-title" className="text-lg font-semibold text-fg-base">Add a friend</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:text-fg-base hover:bg-surface-hover transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <label className="block">
          <span className="sr-only">Search by username or name</span>
          <span className="relative block">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              type="search"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by username or name"
              autoComplete="off"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-input border border-edge-input text-sm text-fg-base placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </span>
        </label>

        <div className="min-h-[120px] max-h-[50vh] overflow-y-auto -mx-1 px-1" aria-live="polite">
          {error ? (
            <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : results === null ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              {loading ? 'Searching…' : 'Type at least two letters of their username or name.'}
            </p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">{loading ? 'Searching…' : 'Nobody found by that name.'}</p>
          ) : (
            <ul className="space-y-1">
              {results.map(p => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
                  <PersonAvatar name={p.displayName} accentColour={p.accentColour} size={36} />
                  <Link href={`/users/${encodeURIComponent(p.username)}`} onClick={onClose} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg-base truncate">{p.displayName}</span>
                    <span className="block text-xs text-fg-muted truncate">@{p.username}</span>
                  </Link>
                  <RelationButton personId={p.id} username={p.username} relation={p.relation} onChange={onChanged} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
