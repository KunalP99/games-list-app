'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'playing', label: 'Playing' },
  { value: 'completed', label: 'Completed' },
]

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'rating', label: 'Rating' },
  { value: 'hours_played', label: 'Hours Played' },
]

export default function GameFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStatus = searchParams.get('status') ?? 'all'
  const activeSort = searchParams.get('sort') ?? 'created_at'

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      {/* Status tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => update('status', tab.value)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activeStatus === tab.value
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <span>Sort by</span>
        <select
          value={activeSort}
          onChange={e => update('sort', e.target.value)}
          className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
