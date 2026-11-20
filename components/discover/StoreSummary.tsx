'use client'

import { useState } from 'react'

/** IGDB's summary, cut after four lines with "Read more" when it's long. */
export default function StoreSummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 260
  return (
    <div className="text-sm leading-relaxed text-fg-secondary">
      {/* Collapsed, paragraphs run together so the four lines are all text
          (IGDB's blank line after the first sentence otherwise eats two). */}
      <p className={long && !open ? 'line-clamp-4' : 'whitespace-pre-line'}>{long && !open ? text.replace(/\s*\n+\s*/g, ' ') : text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-1 text-sm font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-400">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
