'use client'

import { useEffect, useState } from 'react'

/**
 * "Playing now · 42m", ticking on its own.
 *
 * `startedAt` never changes mid-session, so this needs no polling to feel
 * live — the same trick the desktop app's own status window uses, just here
 * as a React interval instead of a Rust one. A 20s tick is plenty for a
 * minutes-resolution display; anything faster would just burn renders.
 */
export default function LiveIndicator({ startedAt, dark = false }: { startedAt: string; dark?: boolean }) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    // Set only on mount: a server-rendered first paint has no clock to read,
    // and starting from null avoids a hydration mismatch against the client's
    // actual time.
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(id)
  }, [])

  if (now == null) return null

  const startedMs = Date.parse(startedAt)
  if (Number.isNaN(startedMs)) return null

  const minutes = Math.max(0, Math.round((now - startedMs) / 60_000))
  const label = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${dark ? 'text-emerald-300' : 'text-emerald-600 dark:text-emerald-400'}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Playing now · {label}
    </span>
  )
}
