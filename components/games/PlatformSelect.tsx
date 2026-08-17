'use client'

import { useState, useEffect, useRef } from 'react'

export const PLATFORM_GROUPS = [
  {
    label: 'PC & Digital',
    platforms: [
      'Steam', 'Epic Games', 'EA App', 'GOG', 'Ubisoft Connect', 'Battle.net',
      'Xbox App (PC)', 'Microsoft Store', 'Itch.io', 'Rockstar Games Launcher',
      'Amazon Luna', 'Game Pass (PC)', 'PC (Windows)', 'Mac', 'Linux', 'Browser',
    ],
  },
  {
    label: 'PlayStation',
    platforms: [
      'PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP', 'PS Vita', 'PlayStation Now',
    ],
  },
  {
    label: 'Xbox',
    platforms: [
      'Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S', 'Xbox Game Pass',
    ],
  },
  {
    label: 'Nintendo',
    platforms: [
      'Nintendo Switch', 'Nintendo Switch Lite', 'Nintendo Switch OLED',
      'Wii U', 'Wii', 'GameCube', 'Nintendo 64', 'SNES', 'NES', 'Virtual Boy',
      'Nintendo 3DS', 'New Nintendo 3DS', 'Nintendo DSi', 'Nintendo DS',
      'Game Boy Advance', 'Game Boy Color', 'Game Boy',
    ],
  },
  {
    label: 'Sega',
    platforms: [
      'Sega Dreamcast', 'Sega Saturn', 'Sega Mega Drive / Genesis',
      'Sega Master System', 'Sega CD', 'Sega 32X', 'Game Gear',
    ],
  },
  {
    label: 'Atari',
    platforms: [
      'Atari 2600', 'Atari 5200', 'Atari 7800', 'Atari Jaguar',
      'Atari Lynx', 'Atari ST',
    ],
  },
  {
    label: 'Other',
    platforms: [
      'Mobile (iOS)', 'Mobile (Android)', 'Mobile (iOS/Android)',
      'Arcade', 'Neo Geo', 'Neo Geo Pocket', 'TurboGrafx-16 / PC Engine',
      'Commodore 64', 'Amiga', 'Other',
    ],
  },
]

const ALL_PLATFORMS = PLATFORM_GROUPS.flatMap(g => g.platforms)

const input = 'w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input'

export default function PlatformSelect({ defaultValue, onChange }: { defaultValue?: string | null; onChange?: (value: string) => void }) {
  const [query, setQuery] = useState(defaultValue ?? '')
  const [selected, setSelected] = useState(defaultValue ?? '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(selected)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selected])

  const isSearching = query.length > 0 && query !== selected
  const filtered = isSearching
    ? ALL_PLATFORMS.filter(p => p.toLowerCase().includes(query.toLowerCase()))
    : null

  function pick(platform: string) {
    setSelected(platform)
    setQuery(platform)
    setOpen(false)
    onChange?.(platform)
  }

  function handleClear() {
    setSelected('')
    setQuery('')
    onChange?.('')
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className={input}
          placeholder="Search or select…"
          autoComplete="off"
        />
        {selected && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary text-lg leading-none"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      <input type="hidden" name="platform" value={selected} />

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-surface-base border border-edge-base rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {isSearching ? (
            filtered && filtered.length > 0 ? (
              filtered.map(platform => (
                <button
                  key={platform}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pick(platform) }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    platform === selected
                      ? 'bg-brand-50 text-brand-700 font-medium dark:bg-brand-900/30 dark:text-brand-300'
                      : 'text-fg-secondary hover:bg-surface-hover'
                  }`}
                >
                  {platform}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-fg-subtle">No platforms found</p>
            )
          ) : (
            PLATFORM_GROUPS.map(group => (
              <div key={group.label}>
                <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                  {group.label}
                </p>
                {group.platforms.map(platform => (
                  <button
                    key={platform}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); pick(platform) }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      platform === selected
                        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-brand-900/30 dark:text-brand-300'
                        : 'text-fg-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {platform}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
