'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
]

export default function VideosFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeSort = searchParams.get('sort') ?? 'newest'
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  // Keep the input in sync if the URL changes externally.
  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
  }, [searchParams])

  // Debounced search → URL.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (search.trim()) params.set('q', search.trim())
      else params.delete('q')
      router.push(`${pathname}?${params.toString()}`)
    }, 300)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  function setSort(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[12rem] max-w-sm">
        <svg
          className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search videos…"
          className="pl-5 pr-5 py-1.5 w-full border-0 border-b border-edge-base text-sm text-fg-base placeholder-fg-subtle bg-transparent focus:outline-none focus:border-brand-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary"
            aria-label="Clear search"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-fg-muted ml-auto">
        <span>Sort by</span>
        <select
          value={activeSort}
          onChange={e => setSort(e.target.value)}
          className="border border-edge-base rounded-lg px-2 py-1.5 text-sm text-fg-secondary bg-surface-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  )
}
