'use client'

import { useState, useEffect } from 'react'

// Renders a spin's timestamp (date + time) in the viewer's local timezone.
// Server/first render shows date-only (timezone-safe); after mount it swaps to
// the full local date + time, so the time isn't shown in the server's UTC.
export default function SpinTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    const d = new Date(iso)
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    setText(`${date} · ${time}`)
  }, [iso])

  return (
    <span suppressHydrationWarning>
      {text ?? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
    </span>
  )
}
