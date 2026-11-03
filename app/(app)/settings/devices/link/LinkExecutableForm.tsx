'use client'

import { useState } from 'react'
import { linkExecutable, unlinkExecutable, ignoreExecutable } from '../../actions'
import { describeKnownSoftware } from '@/lib/known-software'

type Game = { id: string; title: string; platform: string | null; hours_played: number | null; cover_image_url: string | null }
type ExeLink = { exeName: string; gameId: string }

export default function LinkExecutableForm({
  exe,
  games,
  suggested = null,
  links = [],
}: {
  exe: string
  games: Game[]
  suggested?: string | null
  links?: ExeLink[]
}) {
  // The agent's "Yes" button arrives with its guess pre-selected, so
  // confirming is a single click.
  const [selected, setSelected] = useState<string | null>(
    suggested && games.some(g => g.id === suggested) ? suggested : null,
  )
  const [exeName, setExeName] = useState(exe)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [current, setCurrent] = useState<ExeLink[]>(links)
  const [removing, setRemoving] = useState<string | null>(null)
  const [ignoring, setIgnoring] = useState<string | null>(null)

  // Null for anything unrecognised — which includes every real game — so the
  // absence of a warning means nothing either way. Never a block: an unusual
  // launcher or a game sharing a name should still be linkable.
  const warning = describeKnownSoftware(exeName)

  async function handleSave() {
    if (!selected) return
    setLoading(true)
    setMsg(null)
    const result = await linkExecutable(exeName, selected)
    const game = games.find(g => g.id === selected)
    if (result.success) {
      setMsg({ ok: true, text: `Linked. ${game?.title ?? 'That game'} will log its hours automatically from now on.` })
      setCurrent(prev => [
        ...prev.filter(l => l.exeName !== exeName.trim().toLowerCase()),
        { exeName: exeName.trim().toLowerCase(), gameId: selected },
      ])
    } else {
      setMsg({ ok: false, text: result.error })
    }
    setLoading(false)
  }

  async function handleRemove(name: string) {
    setRemoving(name)
    setMsg(null)
    const result = await unlinkExecutable(name)
    if (result.success) setCurrent(prev => prev.filter(l => l.exeName !== name))
    else setMsg({ ok: false, text: result.error })
    setRemoving(null)
  }

  /** For when a link is just plain wrong — a launcher misidentified as an
   *  unrelated game, say — rather than just no longer current. Unlike
   *  Remove, this also stops it from ever being auto-tracked again. */
  async function handleIgnore(name: string) {
    setIgnoring(name)
    setMsg(null)
    const result = await ignoreExecutable(name)
    if (result.success) {
      setCurrent(prev => prev.filter(l => l.exeName !== name))
      setMsg({ ok: true, text: `${name} will never be tracked automatically again. Manage this from Settings.` })
    } else {
      setMsg({ ok: false, text: result.error })
    }
    setIgnoring(null)
  }

  return (
    <div className="space-y-4">
      {current.length > 0 && (
        <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Already linked
          </p>
          <ul className="divide-y divide-edge-subtle">
            {current.map(link => {
              const game = games.find(g => g.id === link.gameId)
              return (
                <li key={link.exeName} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <p className="text-sm text-fg-secondary min-w-0 truncate">
                    <code className="text-xs bg-surface-sunken rounded px-1.5 py-0.5">{link.exeName}</code>
                    <span className="text-fg-subtle"> → </span>
                    {/* A link can outlive the game it points at — say it plainly
                        rather than rendering a blank. */}
                    {game?.title ?? <span className="text-fg-subtle">a game no longer listed as Playing</span>}
                  </p>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRemove(link.exeName)}
                      disabled={removing === link.exeName || ignoring === link.exeName}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-edge-base text-fg-muted hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-50"
                    >
                      {removing === link.exeName ? 'Removing…' : 'Remove'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleIgnore(link.exeName)}
                      disabled={removing === link.exeName || ignoring === link.exeName}
                      title="Stop this from ever being auto-tracked again"
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-edge-base text-fg-muted hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-50"
                    >
                      {ignoring === link.exeName ? 'Ignoring…' : 'Ignore'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

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

      {warning && (
        <p className="text-sm rounded-lg px-3 py-2 text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800">
          <span className="font-medium">{exeName.trim().toLowerCase()}</span> looks like a {warning}.
          Linking it means every minute it is open counts as play time for the game you pick.
        </p>
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
          {loading ? 'Linking…' : warning ? 'Link it anyway' : 'Link this game'}
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
