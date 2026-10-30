'use client'

import { useState } from 'react'
import { linkExecutable } from '../../actions'

type Game = { id: string; title: string; platform: string | null; hours_played: number | null; cover_image_url: string | null }

export default function LinkExecutableForm({ exe, games, suggested = null }: { exe: string; games: Game[]; suggested?: string | null }) {
  // The agent's "Yes" button arrives with its guess pre-selected, so
  // confirming is a single click.
  const [selected, setSelected] = useState<string | null>(
    suggested && games.some(g => g.id === suggested) ? suggested : null,
  )
  const [exeName, setExeName] = useState(exe)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSave() {
    if (!selected) return
    setLoading(true)
    setMsg(null)
    const result = await linkExecutable(exeName, selected)
    const game = games.find(g => g.id === selected)
    setMsg(result.success
      ? { ok: true, text: `Linked. ${game?.title ?? 'That game'} will log its hours automatically from now on.` }
      : { ok: false, text: result.error })
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {!exe && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-4 space-y-2">
          <label htmlFor="exe" className="block text-sm font-medium text-fg-secondary">Program</label>
          <input
            id="exe"
            value={exeName}
            onChange={e => setExeName(e.target.value)}
            placeholder="e.g. SplitFiction.exe"
            className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
          />
        </div>
      )}

      <ul className="bg-surface-base border border-edge-base rounded-xl divide-y divide-edge-subtle overflow-hidden">
        {games.map(game => {
          const active = selected === game.id
          return (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => setSelected(game.id)}
                aria-pressed={active}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  active ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-surface-hover'
                }`}
              >
                {game.cover_image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={game.cover_image_url} alt="" className="w-8 h-11 rounded object-cover shrink-0 bg-surface-sunken" />
                  : <div className="w-8 h-11 rounded shrink-0 bg-surface-sunken" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm truncate ${active ? 'font-semibold text-brand-700 dark:text-brand-300' : 'font-medium text-fg-base'}`}>
                    {game.title}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {[game.platform, `${game.hours_played ?? 0}h logged`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {active && <span className="shrink-0 text-brand-600 dark:text-brand-400 text-sm">Selected</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !selected || exeName.trim().length === 0}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Linking…' : 'Link this game'}
        </button>
        {msg && (
          <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-800'
            : 'text-red-600 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  )
}
