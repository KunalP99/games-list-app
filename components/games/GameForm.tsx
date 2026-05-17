'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createGame, updateGame } from '@/app/(app)/games/actions'
import { createClient } from '@/lib/supabase/client'
import PlatformSelect from './PlatformSelect'
import type { Game } from '@/lib/types'
import type { RawgSearchResult } from '@/lib/rawg'

const STATUS_OPTIONS = [
  { value: 'playing', label: 'Playing' },
  { value: 'completed', label: 'Completed' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'dnf', label: 'Did Not Finish (DNF)' },
]

export default function GameForm({ game, defaultStatus }: { game?: Game; defaultStatus?: string }) {
  const isEdit = !!game
  const router = useRouter()
  const [title, setTitle] = useState(game?.title ?? '')
  const [developer, setDeveloper] = useState(game?.developer ?? '')
  const [releaseDatePrecision, setReleaseDatePrecision] = useState<'full' | 'year'>(game?.release_date_precision ?? 'full')
  const [releaseDate, setReleaseDate] = useState(
    (game?.release_date_precision === 'year') ? '' : (game?.release_date ?? '')
  )
  const [releaseYear, setReleaseYear] = useState(
    (game?.release_date_precision === 'year') ? (game?.release_date?.slice(0, 4) ?? '') : ''
  )
  const [imageUrl, setImageUrl] = useState(game?.image_url ?? '')
  const [rawgId, setRawgId] = useState<number | null>(game?.rawg_id ?? null)
  const [status, setStatus] = useState(game?.status ?? defaultStatus ?? 'playing')
  const [isFavourite, setIsFavourite] = useState(game?.is_favourite ?? false)
  const [isReplay, setIsReplay] = useState(game?.is_replay ?? false)
  const [replayDetected, setReplayDetected] = useState(false)
  const [isSequel, setIsSequel] = useState(game?.is_sequel ?? false)
  const [completionDatePrecision, setCompletionDatePrecision] = useState<'full' | 'year'>(game?.completion_date_precision ?? 'full')
  const [completionYear, setCompletionYear] = useState(
    (game?.completion_date_precision === 'year') ? (game?.completion_date?.slice(0, 4) ?? '') : ''
  )
  type DlcEntry = { name: string; rawgId: number | null; owned: boolean; removed?: boolean }
  const [dlcEntries, setDlcEntries] = useState<DlcEntry[]>(
    (game as any)?.dlc?.map((d: { name: string; rawg_id: number | null; owned: boolean; removed?: boolean }) => ({
      name: d.name, rawgId: d.rawg_id, owned: d.owned, removed: d.removed ?? false,
    })) ?? []
  )
  const [dlcLoading, setDlcLoading] = useState(false)
  const [customDlcInput, setCustomDlcInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // RAWG autocomplete state
  const [suggestions, setSuggestions] = useState<RawgSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const replayDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rawgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // RAWG search debounce — fires at 300ms on title change
  useEffect(() => {
    if (rawgDebounceRef.current) clearTimeout(rawgDebounceRef.current)

    if (title.trim().length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    rawgDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/rawg/search?q=${encodeURIComponent(title.trim())}`)
        const { results } = await res.json()
        setSuggestions(results ?? [])
        setShowDropdown((results ?? []).length > 0)
      } catch {
        setSuggestions([])
        setShowDropdown(false)
      } finally {
        setSearchLoading(false)
      }
    }, 300)

    return () => {
      if (rawgDebounceRef.current) clearTimeout(rawgDebounceRef.current)
    }
  }, [title])

  // Supabase replay detection — fires at 500ms, only on new game form
  useEffect(() => {
    if (isEdit || title.trim().length < 2) {
      setReplayDetected(false)
      if (!isEdit) setIsReplay(false)
      return
    }

    if (replayDebounceRef.current) clearTimeout(replayDebounceRef.current)

    replayDebounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('games')
        .select('id')
        .eq('user_id', user.id)
        .ilike('title', title.trim())
        .limit(1)

      if (data && data.length > 0) {
        setReplayDetected(true)
        setIsReplay(true)
      } else {
        setReplayDetected(false)
      }
    }, 500)

    return () => {
      if (replayDebounceRef.current) clearTimeout(replayDebounceRef.current)
    }
  }, [title, isEdit])

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  async function fetchDlc(rawgId: number, existingEntries: DlcEntry[] = []) {
    setDlcLoading(true)
    try {
      const res = await fetch(`/api/rawg/additions/${rawgId}`)
      const data: { id: number; name: string }[] = await res.json()
      if (!Array.isArray(data)) { setDlcLoading(false); return }
      // Merge: RAWG additions as base, preserve owned/removed state from existing entries
      const existingByRawgId = new Map(existingEntries.filter(e => e.rawgId !== null).map(e => [e.rawgId, e]))
      const rawgEntries: DlcEntry[] = data.map(d => {
        const existing = existingByRawgId.get(d.id)
        return {
          name: d.name,
          rawgId: d.id,
          owned: existing?.owned ?? false,
          removed: existing?.removed ?? false,
        }
      })
      // Keep any custom entries (no rawgId) from existing
      const customEntries = existingEntries.filter(e => e.rawgId === null)
      setDlcEntries([...rawgEntries, ...customEntries])
    } catch {
      // keep existing entries on error
    } finally {
      setDlcLoading(false)
    }
  }

  useEffect(() => {
    if (isEdit && game?.rawg_id) {
      fetchDlc(game.rawg_id, dlcEntries)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRawgSelect(result: RawgSearchResult) {
    setTitle(result.name)
    setReleaseDate(result.released ?? '')
    setReleaseDatePrecision('full')
    setImageUrl(result.background_image ?? '')
    setRawgId(result.id)
    setSuggestions([])
    setShowDropdown(false)

    // Fetch full detail to get developer (not included in search results)
    try {
      const res = await fetch(`/api/rawg/detail/${result.id}`)
      const detail = await res.json()
      if (detail?.developers?.[0]?.name) {
        setDeveloper(detail.developers[0].name)
      }
      if (detail?.released) {
        setReleaseDate(detail.released)
      }
    } catch {
      // silently ignore — user can fill manually
    }

    // Fetch DLC list for the selected game (fresh — no existing entries to preserve)
    setDlcEntries([])
    fetchDlc(result.id, [])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = isEdit
      ? await updateGame(game.id, formData)
      : await createGame(formData)

    if (result && 'error' in result) {
      setError(result.error as string)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Info */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Basic Info</h2>

        <div className="relative" ref={dropdownRef}>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              name="title"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              className={input}
              placeholder="e.g. The Witcher 3"
              autoComplete="off"
            />
            {searchLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                Searching…
              </span>
            )}
          </div>

          {showDropdown && (
            <div className="absolute z-20 mt-1 w-full bg-surface-base border border-edge-base rounded-lg shadow-lg overflow-hidden">
              {suggestions.map(result => (
                <button
                  key={result.id}
                  type="button"
                  onMouseDown={() => handleRawgSelect(result)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover text-left border-b border-edge-subtle last:border-0"
                >
                  {result.background_image ? (
                    <img
                      src={result.background_image}
                      alt=""
                      className="w-12 h-8 object-cover rounded shrink-0 bg-surface-active"
                    />
                  ) : (
                    <div className="w-12 h-8 rounded bg-surface-active shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg-base truncate">{result.name}</p>
                    {result.released && (
                      <p className="text-xs text-fg-subtle">{result.released.slice(0, 4)}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isEdit && replayDetected && (
            <p className="mt-2 flex items-center gap-2 text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300">
              <span>↩</span>
              You&apos;ve already added this game — we&apos;ve marked it as a replay.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">Developer</label>
            <input
              name="developer"
              value={developer}
              onChange={e => setDeveloper(e.target.value)}
              className={input}
              placeholder="e.g. CD Projekt Red"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-fg-secondary">Release Date</label>
              <button
                type="button"
                onClick={() => {
                  const next = releaseDatePrecision === 'full' ? 'year' : 'full'
                  setReleaseDatePrecision(next)
                  if (next === 'year' && releaseDate) setReleaseYear(releaseDate.slice(0, 4))
                }}
                className="text-[11px] text-fg-subtle hover:text-fg-secondary transition-colors underline underline-offset-2"
              >
                {releaseDatePrecision === 'year' ? 'Switch to full date' : 'Year only'}
              </button>
            </div>
            {releaseDatePrecision === 'year' ? (
              <input
                name="release_date_year"
                type="number"
                min="1950"
                max={new Date().getFullYear() + 5}
                value={releaseYear}
                onChange={e => setReleaseYear(e.target.value)}
                placeholder={`e.g. ${new Date().getFullYear() - 2}`}
                className={input}
              />
            ) : (
              <input
                name="release_date"
                type="date"
                value={releaseDate}
                onChange={e => setReleaseDate(e.target.value)}
                className={input}
              />
            )}
            <input type="hidden" name="release_date_precision" value={releaseDatePrecision} />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">Platform</label>
            <PlatformSelect defaultValue={game?.platform} />
          </div>
        </div>
      </section>

      {/* Cover Image */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Cover Image</h2>
        <div className="flex gap-3 items-start">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Cover preview"
              className="w-20 h-14 object-cover rounded-lg border border-edge-base shrink-0 bg-surface-active"
            />
          )}
          <div className="flex-1">
            <label className="block text-sm font-medium text-fg-secondary mb-1">
              Image URL{' '}
              <span className="text-xs text-fg-subtle font-normal">
                (auto-filled from RAWG, or paste your own)
              </span>
            </label>
            <input
              name="image_url"
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              className={input}
              placeholder="https://example.com/cover.jpg"
            />
          </div>
        </div>
      </section>

      {/* Media */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Media</h2>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            YouTube Playlist URL{' '}
            <span className="text-xs text-fg-subtle font-normal">(optional — shown on the game page)</span>
          </label>
          <input
            name="youtube_playlist_url"
            type="url"
            defaultValue={game?.youtube_playlist_url ?? ''}
            className={input}
            placeholder="https://www.youtube.com/playlist?list=PLxxxxx"
          />
        </div>
      </section>

      {/* Status & Progress */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Status & Progress</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">Status</label>
            <select
              name="status"
              value={status}
              onChange={e => setStatus(e.target.value as 'backlog' | 'playing' | 'completed' | 'dnf')}
              className={input}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">Hours Played</label>
            <input
              name="hours_played"
              type="number"
              min={0}
              step={0.1}
              defaultValue={game?.hours_played ?? ''}
              className={input}
              placeholder="e.g. 42"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            Achievement Progress (%)
          </label>
          <input
            name="achievement_progress"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={game?.achievement_progress != null ? Math.round(game.achievement_progress) : ''}
            className={input}
            placeholder="e.g. 75"
          />
        </div>

        {/* Completion fields — only shown when status is completed */}
        {status === 'completed' && (
          <div className="space-y-4 pt-2 border-t border-edge-subtle">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-fg-secondary">Completion Date</label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = completionDatePrecision === 'full' ? 'year' : 'full'
                      setCompletionDatePrecision(next)
                    }}
                    className="text-[11px] text-fg-subtle hover:text-fg-secondary transition-colors underline underline-offset-2"
                  >
                    {completionDatePrecision === 'year' ? 'Switch to full date' : 'Year only'}
                  </button>
                </div>
                {completionDatePrecision === 'year' ? (
                  <input
                    name="completion_date_year"
                    type="number"
                    min="1950"
                    max={new Date().getFullYear()}
                    value={completionYear}
                    onChange={e => setCompletionYear(e.target.value)}
                    placeholder={`e.g. ${new Date().getFullYear()}`}
                    className={input}
                  />
                ) : (
                  <input
                    name="completion_date"
                    type="date"
                    defaultValue={
                      game?.completion_date_precision === 'year' ? '' : (game?.completion_date ?? '')
                    }
                    className={input}
                  />
                )}
                <input type="hidden" name="completion_date_precision" value={completionDatePrecision} />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  Rating (1–5) <span className="text-red-500">*</span>
                </label>
                <input
                  name="rating"
                  type="number"
                  required
                  min={1}
                  max={5}
                  step={0.5}
                  defaultValue={game?.rating ?? ''}
                  className={input}
                  placeholder="e.g. 3.5"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Review</label>
              <textarea
                name="review"
                rows={4}
                defaultValue={game?.review ?? ''}
                className={input}
                placeholder="What did you think?"
              />
            </div>
          </div>
        )}

        {/* DNF fields — only shown when status is dnf */}
        {status === 'dnf' && (
          <div className="space-y-4 pt-2 border-t border-edge-subtle">
            <p className="text-xs text-red-500 font-medium">
              Did Not Finish — mark games you started but decided to stop playing.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-fg-secondary">Date Dropped</label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = completionDatePrecision === 'full' ? 'year' : 'full'
                      setCompletionDatePrecision(next)
                    }}
                    className="text-[11px] text-fg-subtle hover:text-fg-secondary transition-colors underline underline-offset-2"
                  >
                    {completionDatePrecision === 'year' ? 'Switch to full date' : 'Year only'}
                  </button>
                </div>
                {completionDatePrecision === 'year' ? (
                  <input
                    name="completion_date_year"
                    type="number"
                    min="1950"
                    max={new Date().getFullYear()}
                    value={completionYear}
                    onChange={e => setCompletionYear(e.target.value)}
                    placeholder={`e.g. ${new Date().getFullYear()}`}
                    className={input}
                  />
                ) : (
                  <input
                    name="completion_date"
                    type="date"
                    defaultValue={
                      game?.completion_date_precision === 'year' ? '' : (game?.completion_date ?? '')
                    }
                    className={input}
                  />
                )}
                <input type="hidden" name="completion_date_precision" value={completionDatePrecision} />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">Rating (1–5) <span className="text-xs text-fg-subtle font-normal">optional</span></label>
                <input
                  name="rating"
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  defaultValue={game?.rating ?? ''}
                  className={input}
                  placeholder="e.g. 2.5"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Reason <span className="text-xs text-fg-subtle font-normal">optional</span></label>
              <textarea
                name="review"
                rows={3}
                defaultValue={game?.review ?? ''}
                className={input}
                placeholder="Why did you stop playing?"
              />
            </div>
          </div>
        )}
      </section>

      {/* Flags */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-4">Flags</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsFavourite(f => !f)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isFavourite
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'border-edge-base text-fg-muted hover:border-edge-input hover:text-fg-secondary'
            }`}
          >
            <span>★</span> Favourite
          </button>
          <button
            type="button"
            onClick={() => setIsReplay(r => !r)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isReplay
                ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300'
                : 'border-edge-base text-fg-muted hover:border-edge-input hover:text-fg-secondary'
            }`}
          >
            <span>↩</span> Replay
          </button>
          <div className="relative group">
            <button
              type="button"
              onClick={() => setIsSequel(s => !s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isSequel
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-edge-base text-fg-muted hover:border-edge-input hover:text-fg-secondary'
              }`}
            >
              <span>🔗</span> Sequel
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-zinc-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center leading-relaxed">
              Only tick this if the last game you completed was a direct prequel to this one. You&apos;ll earn a bonus ticket when you complete it.
            </div>
          </div>
        </div>
        {isFavourite && <input type="hidden" name="is_favourite" value="on" />}
        {isReplay && <input type="hidden" name="is_replay" value="on" />}
        {isSequel && <input type="hidden" name="is_sequel" value="on" />}
        {rawgId !== null && <input type="hidden" name="rawg_id" value={rawgId} />}
        <input type="hidden" name="dlc" value={JSON.stringify(
          dlcEntries.map(e => ({ name: e.name, rawg_id: e.rawgId, owned: e.owned, removed: e.removed ?? false }))
        )} />
      </section>

      {/* DLC & Expansions */}
      {(dlcLoading || dlcEntries.length > 0 || rawgId !== null) && (
        <section className="bg-surface-base border border-edge-base rounded-xl p-6">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-1">DLC &amp; Expansions</h2>
          <p className="text-xs text-fg-subtle mb-4">Check the DLC you own, remove ones you don&apos;t want to track, or add your own</p>
          {dlcLoading ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 bg-surface-active rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {dlcEntries.map((dlc, i) => {
                if (dlc.removed) {
                  // Greyed-out RAWG entry — show with restore button
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg opacity-40">
                      <span className="w-4 h-4 shrink-0 flex items-center justify-center text-fg-subtle text-sm">–</span>
                      <span className="text-sm text-fg-muted flex-1 min-w-0 truncate line-through">{dlc.name}</span>
                      <button
                        type="button"
                        onClick={() => setDlcEntries(prev => prev.map((e, j) => j === i ? { ...e, removed: false } : e))}
                        className="shrink-0 text-fg-subtle hover:text-brand-600 transition-colors text-sm font-medium"
                        aria-label={`Restore ${dlc.name}`}
                      >
                        ✓
                      </button>
                    </div>
                  )
                }
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group">
                    <input
                      type="checkbox"
                      checked={dlc.owned}
                      onChange={() =>
                        setDlcEntries(prev => prev.map((e, j) => j === i ? { ...e, owned: !e.owned } : e))
                      }
                      className="w-4 h-4 rounded accent-brand-600 shrink-0 cursor-pointer"
                    />
                    <span className="text-sm text-fg-base flex-1 min-w-0 truncate">{dlc.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        dlc.rawgId !== null
                          ? setDlcEntries(prev => prev.map((e, j) => j === i ? { ...e, removed: true } : e))
                          : setDlcEntries(prev => prev.filter((_, j) => j !== i))
                      }
                      className="shrink-0 text-fg-subtle hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                      aria-label={`Remove ${dlc.name}`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add custom DLC */}
          {!dlcLoading && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={customDlcInput}
                onChange={e => setCustomDlcInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const name = customDlcInput.trim()
                    if (name) {
                      setDlcEntries(prev => [...prev, { name, rawgId: null, owned: false }])
                      setCustomDlcInput('')
                    }
                  }
                }}
                placeholder="Add a DLC manually…"
                className="flex-1 px-3 py-2 text-sm border border-edge-base rounded-lg bg-surface-sunken text-fg-base placeholder:text-fg-subtle focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => {
                  const name = customDlcInput.trim()
                  if (name) {
                    setDlcEntries(prev => [...prev, { name, rawgId: null, owned: false }])
                    setCustomDlcInput('')
                  }
                }}
                className="px-3 py-2 text-sm font-medium border border-edge-base rounded-lg text-fg-secondary hover:bg-surface-hover transition-colors"
              >
                Add
              </button>
            </div>
          )}
        </section>
      )}

      {/* Notes — always visible, private */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-4">Notes</h2>
        <label className="block text-sm font-medium text-fg-secondary mb-1">
          Personal notes <span className="text-xs text-fg-subtle">(private)</span>
        </label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={game?.notes ?? ''}
          className={input}
          placeholder="Personal reminders, tips, etc."
        />
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Game'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 border border-edge-base text-fg-secondary text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

const input = 'w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input'
