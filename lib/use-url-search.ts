'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * A search box kept in the URL's `?q=`, updated a moment after you stop
 * typing. Used by the games and videos filters.
 *
 * Bugs this replaces (each reproduced in a browser before the fix):
 * - The delayed update built the URL from the address as it was when it was
 *   scheduled, so a tab clicked inside that moment was undone: clicking
 *   Backlog right after opening /games?status=all, or right after typing,
 *   left you on All.
 * - Any change to the URL (a tab click, a sort) reset the box to the URL's
 *   `q`, wiping text typed just before.
 *
 * So: the filters' own navigations (tabs, sort, view) go through `applyTo`,
 * which puts the box's current text into that same URL and cancels the
 * pending update — one navigation carrying both, nothing left to undo it.
 * The delayed update never fires when the box already matches the URL (or
 * what this hook just sent there), and the box only follows the URL when `q`
 * itself changes from elsewhere (Back/Forward, a link that clears it).
 */
export function useUrlSearch(delayMs = 300) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''
  const [search, setSearch] = useState(urlQuery)
  // What this hook last sent to the URL (still arriving, if the navigation is
  // in flight), and the pending delayed update.
  const sent = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (urlQuery === sent.current) {
      sent.current = null
      return
    }
    setSearch(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    const wanted = search.trim()
    if (wanted === urlQuery || wanted === sent.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      const params = new URLSearchParams(searchParams.toString())
      if (wanted) params.set('q', wanted)
      else params.delete('q')
      sent.current = wanted
      // Typing never moves the page.
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }, delayMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [search, urlQuery, searchParams, pathname, router, delayMs])

  /** Puts the box's current text into `params` for a navigation of the caller's own, and cancels the pending update. */
  const applyTo = useCallback((params: URLSearchParams) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const wanted = search.trim()
    if (wanted) params.set('q', wanted)
    else params.delete('q')
    if (wanted !== urlQuery) sent.current = wanted
    return params
  }, [search, urlQuery])

  return { search, setSearch, applyTo }
}
