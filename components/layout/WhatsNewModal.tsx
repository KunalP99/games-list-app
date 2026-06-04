'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dismissed_changelog'

type Props = {
  entry: { id: string; version: string; title: string; body: string } | null
}

export default function WhatsNewModal({ entry }: Props) {
  const [visible, setVisible] = useState(false)
  const [dontShow, setDontShow] = useState(false)

  useEffect(() => {
    if (!entry) return
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed !== entry.id) setVisible(true)
  }, [entry])

  function close() {
    if (dontShow && entry) localStorage.setItem(STORAGE_KEY, entry.id)
    setVisible(false)
  }

  if (!visible || !entry) return null

  const lines = entry.body.split('\n').map(l => l.trim()).filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="relative bg-surface-raised border border-edge-base rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
        <div>
          <p className="text-xs text-brand-500 font-medium uppercase tracking-wider mb-1">v{entry.version}</p>
          <h2 className="text-lg font-semibold text-fg-base">{entry.title}</h2>
        </div>
        <ul className="space-y-1.5 text-sm text-fg-secondary">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand-500 shrink-0">•</span>
              <span>{line.startsWith('- ') ? line.slice(2) : line}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between pt-2 border-t border-edge-base">
          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={e => setDontShow(e.target.checked)}
              className="rounded accent-brand-600"
            />
            Don&apos;t show again
          </label>
          <button
            onClick={close}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
