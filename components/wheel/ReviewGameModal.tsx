'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PLATFORM_GROUPS } from '@/components/games/PlatformSelect'
import type { RawgGameDetail } from '@/lib/rawg'

// Shown before the wheel adds a game to the library: a read-only preview of the
// game (developer, release date, genres) plus two editable things — a required
// platform and the card image (pick from the game's images or paste a custom URL).
export default function ReviewGameModal({
  game,
  isPending,
  error,
  onConfirm,
  onCancel,
}: {
  game: { id: number; name: string }
  isPending: boolean
  error: string
  onConfirm: (platform: string, image: string | null) => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [detail, setDetail] = useState<RawgGameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<string[]>([])
  const [imagesLoading, setImagesLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [platform, setPlatform] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/rawg/detail/${game.id}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setDetail(d && typeof d === 'object' ? d : null); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [game.id])

  useEffect(() => {
    let cancelled = false
    setImagesLoading(true)
    fetch(`/api/rawg/images/${game.id}`)
      .then(r => r.json())
      .then(list => {
        if (cancelled) return
        const arr = Array.isArray(list) ? list.filter((u: unknown): u is string => typeof u === 'string') : []
        setImages(arr)
        setSelectedImage(arr[0] ?? '') // default to the auto-chosen key art
        setImagesLoading(false)
      })
      .catch(() => { if (!cancelled) setImagesLoading(false) })
    return () => { cancelled = true }
  }, [game.id])

  function handleConfirm() {
    if (!platform.trim()) { setLocalError('Please select a platform.'); return }
    setLocalError('')
    const image = customUrl.trim() || selectedImage || null
    onConfirm(platform.trim(), image)
  }

  if (!mounted) return null

  const cover = detail?.cover_image ?? detail?.artwork_image ?? detail?.background_image
  const developer = detail?.developers?.[0]?.name
  const genres = detail?.genres?.map(g => g.name) ?? []
  const released = detail?.released
    ? new Date(detail.released).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isPending && onCancel()} />
      <div className="relative w-full max-w-lg bg-surface-base border border-edge-base rounded-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <p className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Add to your list</p>
          <h2 className="text-lg font-semibold text-fg-base mt-0.5 leading-tight">{game.name}</h2>
        </div>

        {/* Read-only preview + platform */}
        <div className="flex gap-4">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="w-24 h-32 rounded-lg object-cover shrink-0 bg-surface-active" />
          ) : (
            <div className="w-24 h-32 rounded-lg bg-surface-active shrink-0 flex items-center justify-center text-2xl">🎮</div>
          )}
          <div className="min-w-0 flex-1 text-sm space-y-1.5">
            {loading ? (
              <p className="text-fg-subtle">Loading details…</p>
            ) : (
              <>
                {developer && <p><span className="text-fg-muted">Developer:</span> <span className="text-fg-secondary">{developer}</span></p>}
                {released && <p><span className="text-fg-muted">Released:</span> <span className="text-fg-secondary">{released}</span></p>}
                {genres.length > 0 && <p><span className="text-fg-muted">Genres:</span> <span className="text-fg-secondary">{genres.join(', ')}</span></p>}
              </>
            )}
            {/* Platform — the only required field, styled like the info rows above */}
            <p className="flex items-center gap-1.5 flex-wrap">
              <span className="text-fg-muted">Platform<span className="text-red-500">*</span>:</span>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="text-sm text-fg-secondary bg-surface-input border border-edge-input rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-full"
              >
                <option value="">Select…</option>
                {PLATFORM_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.platforms.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                ))}
              </select>
            </p>
          </div>
        </div>

        {/* Image chooser */}
        <div>
          <p className="text-sm font-medium text-fg-secondary mb-2">
            Image <span className="text-fg-subtle font-normal">(pick one, or paste your own)</span>
          </p>
          {imagesLoading ? (
            <p className="text-xs text-fg-subtle">Loading images…</p>
          ) : images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
              {images.map(url => {
                const isSel = !customUrl.trim() && selectedImage === url
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => { setSelectedImage(url); setCustomUrl('') }}
                    aria-pressed={isSel}
                    className={`relative aspect-video rounded-md bg-cover bg-center border transition-all ${
                      isSel ? 'ring-2 ring-brand-500 border-brand-500' : 'border-edge-base hover:border-brand-300'
                    }`}
                    style={{ backgroundImage: `url(${url})` }}
                  >
                    {isSel && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shadow">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">No images found — paste a URL below if you want one.</p>
          )}
          <input
            type="url"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="mt-2 w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
          />
        </div>

        {(localError || error) && <p className="text-sm text-red-600">{localError || error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg-base border border-edge-base rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Adding…' : 'Add to my list'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
