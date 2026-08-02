'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createVideo, createPlaylist, fetchPlaylistForImport } from '@/app/(app)/videos/actions'

export default function AddVideoForm() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isPlaylist, setIsPlaylist] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Controlled playlist-mode state (so import can pre-fill it)
  const [plTitle, setPlTitle] = useState('')
  const [plYoutubeUrl, setPlYoutubeUrl] = useState('')
  const [plUrls, setPlUrls] = useState<string[]>(['', '', ''])
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !isPending) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isPending])

  function close() {
    setOpen(false)
    setError(null)
    setIsPlaylist(false)
    setPlTitle('')
    setPlYoutubeUrl('')
    setPlUrls(['', '', ''])
    setImportUrl('')
    setImportNote(null)
    formRef.current?.reset()
  }

  function handleImport() {
    if (!importUrl.trim()) return
    setError(null)
    setImportNote(null)
    setImporting(true)
    startTransition(async () => {
      const res = await fetchPlaylistForImport(importUrl.trim())
      setImporting(false)
      if (!res.success) { setError(res.error); return }
      setPlTitle(prev => prev || res.title)
      setPlYoutubeUrl(res.youtubeUrl)
      setPlUrls(res.videos.map(v => v.url))
      setImportNote(`Imported ${res.videos.length} video${res.videos.length !== 1 ? 's' : ''} — edit or remove any below, then Create.`)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = isPlaylist ? await createPlaylist(formData) : await createVideo(formData)
      if (result.success) close()
      else setError(result.error)
    })
  }

  const input = 'w-full border border-edge-input rounded-lg px-3 py-2 text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-input'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
        aria-label="Add a video or playlist"
        title="Add a video or playlist"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
        Add
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isPending && close()}
          />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-surface-base border border-edge-base rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-fg-base">
                {isPlaylist ? 'Create a playlist' : 'Add a video'}
              </h2>
              <p className="text-sm text-fg-muted mt-0.5">Titles and thumbnails are fetched from YouTube automatically.</p>
            </div>

            {/* Mode toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPlaylist}
                onChange={e => setIsPlaylist(e.target.checked)}
                className="w-4 h-4 rounded border-edge-input text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm font-medium text-fg-secondary">Make a playlist (group multiple videos)</span>
            </label>

            {/* Import from a YouTube playlist (playlist mode only) */}
            {isPlaylist && (
              <div className="rounded-lg border border-edge-subtle bg-surface-sunken p-3 space-y-2">
                <p className="text-xs font-medium text-fg-secondary">Import from a YouTube playlist</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    placeholder="YouTube playlist link…"
                    className={input}
                  />
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={importing || !importUrl.trim()}
                    className="shrink-0 px-3 py-2 text-sm font-semibold text-brand-700 bg-brand-100 rounded-lg hover:bg-brand-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-brand-900/40 dark:text-brand-300 dark:hover:bg-brand-900/60"
                  >
                    {importing ? 'Importing…' : 'Import'}
                  </button>
                </div>
                {importNote && <p className="text-xs text-emerald-600 dark:text-emerald-400">{importNote}</p>}
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
              {isPlaylist ? (
                <>
                  <input
                    name="title"
                    type="text"
                    required
                    value={plTitle}
                    onChange={e => setPlTitle(e.target.value)}
                    placeholder="Playlist title…"
                    className={input}
                  />
                  <input
                    name="youtube_url"
                    type="url"
                    value={plYoutubeUrl}
                    onChange={e => setPlYoutubeUrl(e.target.value)}
                    placeholder="YouTube playlist link (optional — for a watch-on-YouTube button)"
                    className={input}
                  />
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Videos</p>
                    {plUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          name="url"
                          type="url"
                          value={url}
                          onChange={e => setPlUrls(prev => prev.map((u, j) => (j === i ? e.target.value : u)))}
                          placeholder={`Video ${i + 1} URL…`}
                          className={input}
                        />
                        {plUrls.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPlUrls(prev => prev.filter((_, j) => j !== i))}
                            className="shrink-0 text-fg-subtle hover:text-red-500 transition-colors px-1"
                            aria-label={`Remove video ${i + 1}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPlUrls(prev => [...prev, ''])}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-800 dark:hover:text-brand-400 transition-colors"
                    >
                      + Add another video
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <input name="url" type="url" required autoFocus placeholder="Paste a YouTube video URL…" className={input} />
                  <input name="title" type="text" placeholder="Custom title (optional)" className={input} />
                </>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-fg-muted border border-edge-base rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending ? 'Saving…' : isPlaylist ? 'Create playlist' : 'Add video'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
