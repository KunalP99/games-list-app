'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'dnf', label: 'DNF' },
]

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'rating', label: 'Rating' },
  { value: 'hours_played', label: 'Hours Played' },
  { value: 'status', label: 'Status' },
]

export default function GameFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStatus = searchParams.get('status') ?? 'all'
  const activeSort = searchParams.get('sort') ?? 'created_at'
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  // Sync search input if URL param changes externally (e.g. tab switch clears q)
  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
  }, [searchParams])

  // Debounced search → URL update
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (search.trim()) {
        params.set('q', search.trim())
      } else {
        params.delete('q')
      }
      router.push(`${pathname}?${params.toString()}`)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  const searchInput = (
    <div className="relative">
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
        placeholder="Search..."
        className="pl-5 pr-5 py-1.5 w-full sm:w-36 border-0 border-b border-edge-base text-sm text-fg-base placeholder-fg-subtle bg-transparent focus:outline-none focus:border-brand-500 sm:focus:w-48 transition-all duration-200"
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
  )

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search: full-width above tabs on mobile, inline after tabs on sm+ */}
      <div className="w-full order-first sm:w-auto sm:order-2">
        {searchInput}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-surface-active rounded-lg p-1 order-2 sm:order-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => update('status', tab.value)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activeStatus === tab.value
                ? 'bg-surface-base text-fg-base shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 text-sm text-fg-muted order-3 ml-auto">
        <span>Sort by</span>
        <select
          value={activeSort}
          onChange={e => update('sort', e.target.value)}
          className="border border-edge-base rounded-lg px-2 py-1.5 text-sm text-fg-secondary bg-surface-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
