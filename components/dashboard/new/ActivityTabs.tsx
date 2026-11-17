'use client'

import { useState } from 'react'

type Tab = 'everyone' | 'you' | 'friends'
const LABELS: Record<Tab, string> = { everyone: 'Everyone', you: 'You', friends: 'Friends' }

/**
 * Everyone / You / Friends filter for the Activity card. The three lists are
 * rendered on the server and handed in whole, so switching is instant and
 * needs no fetch.
 */
export default function ActivityTabs({ panels }: { panels: Record<Tab, React.ReactNode> }) {
  const [tab, setTab] = useState<Tab>('everyone')
  return (
    <div>
      <div role="tablist" aria-label="Whose activity" className="flex gap-1 text-[13px]">
        {(Object.keys(LABELS) as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-8 px-3 rounded-full font-medium transition-colors ${
              tab === t ? 'bg-surface-active text-fg-base' : 'text-fg-muted hover:text-fg-base'
            }`}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-2">{panels[tab]}</div>
    </div>
  )
}
