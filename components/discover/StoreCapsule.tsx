'use client'

import { useState } from 'react'

/**
 * The store page's wide picture (460×215): the game's main artwork. Steam's
 * header image when the game is on Steam (the banner at the top of its Steam
 * page: exactly this shape, its official key art), else IGDB's pick
 * (capsuleImage in lib/igdb.ts). Some Steam ids have no header (a 404), so a
 * failed image moves on to the next; with none left the box isn't shown.
 */
export default function StoreCapsule({ sources }: { sources: string[] }) {
  const [at, setAt] = useState(0)
  const src = sources[at]
  if (!src) return null
  return (
    <img
      key={src}
      src={src}
      alt=""
      onError={() => setAt(i => i + 1)}
      className="aspect-[460/215] w-full rounded-xl object-cover"
    />
  )
}
