'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addRecommendationToBacklog } from '@/app/(app)/games/actions'
import ReviewGameModal from '@/components/wheel/ReviewGameModal'
import StatusBadge from '@/components/games/StatusBadge'
import type { GameStatus } from '@/lib/types'

type Owned = { id: string; status: GameStatus; hours: number | null }

/**
 * The store page's "Add <game> to your library" bar: Add to Backlog, or (for
 * a game that's out) I'm playing it, both through the same review step and
 * server action as every other add (platform, picture). If it's already in
 * the library, says so instead, with the status, hours and a link to it.
 * Under it: the shops IGDB lists for the game.
 */
export default function StoreAddBar({ game, owned, upcoming, stores }: {
  game: { igdbId: number; name: string; developer: string | null; image: string | null; genres: string[]; releaseDate: string | null }
  owned: Owned | null
  upcoming: boolean
  stores: { label: string; url: string }[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState<'backlog' | 'playing' | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function add(status: 'backlog' | 'playing', platform: string, image: string | null, steamDeck: boolean) {
    start(async () => {
      const form = new FormData()
      form.set('title', game.name)
      form.set('developer', game.developer ?? '')
      form.set('image_url', game.image ?? '')
      form.set('genres', JSON.stringify(game.genres))
      form.set('rawg_id', String(game.igdbId))
      form.set('release_date', game.releaseDate ?? '')
      form.set('platform', platform)
      form.set('status', status)
      if (image) form.set('chosen_image', image)
      if (steamDeck) form.set('steam_deck', 'on')
      const result = await addRecommendationToBacklog(form)
      if (result.success) { setAdding(null); setError(''); router.refresh() }
      else setError(result.error ?? 'Couldn’t add it. Please try again.')
    })
  }

  const shopLine = stores.length > 0 && (
    <p className="mt-0.5 text-sm text-fg-muted">
      {upcoming ? 'Pre-order: ' : 'Buy it at: '}
      {stores.map((s, i) => (
        <span key={s.label}>
          {i > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-400">{s.label}</a>
        </span>
      ))}
    </p>
  )

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-edge-base bg-surface-base px-5 py-4">
      <div className="min-w-[240px] flex-1">
        {owned ? (
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg-base">
            In your library <StatusBadge status={owned.status} />
            {owned.hours ? <span className="text-sm font-normal text-fg-muted">{owned.hours}h played</span> : null}
          </p>
        ) : (
          <p className="text-base font-semibold text-fg-base">
            Add {game.name} to your {upcoming ? 'backlog' : 'library'}
          </p>
        )}
        {!owned && upcoming && <p className="mt-0.5 text-sm text-fg-muted">You’ll get a notification on release day.</p>}
        {shopLine}
        {error && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {owned ? (
        <Link href={`/games/${owned.id}`} className="inline-flex h-11 items-center rounded-lg border border-edge-base px-4 text-sm font-medium text-fg-secondary hover:bg-surface-hover">
          Open in your library
        </Link>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {!upcoming && (
            <button type="button" disabled={pending} onClick={() => setAdding('playing')} className="h-11 rounded-lg border border-edge-base px-4 text-sm font-medium text-fg-secondary hover:bg-surface-hover disabled:opacity-50">
              I’m playing it
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => setAdding('backlog')} className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Add to Backlog
          </button>
        </div>
      )}

      {adding && (
        <ReviewGameModal
          game={{ id: game.igdbId, name: game.name }}
          isPending={pending}
          error={error}
          heading={adding === 'playing' ? 'Add to Playing' : 'Add to your backlog'}
          confirmLabel={adding === 'playing' ? 'Add to Playing' : 'Add to backlog'}
          showSteamDeck
          onConfirm={(platform, image, steamDeck) => add(adding, platform, image, steamDeck)}
          onCancel={() => { setAdding(null); setError('') }}
        />
      )}
    </section>
  )
}
