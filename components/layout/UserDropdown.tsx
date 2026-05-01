'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'
import type { Profile } from '@/lib/types'

export default function UserDropdown({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const name = profile.display_name ?? profile.username
  const initial = name.charAt(0).toUpperCase()
  const accent = (profile as any).accent_colour ?? '#ff5722'

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] px-1.5 py-1 transition-colors"
        aria-label="User menu"
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
          style={{ backgroundColor: 'rgb(var(--brand-600))' }}
        >
          {initial}
        </span>
        <span className="hidden lg:block text-xs text-fg-muted shrink-0 max-w-24 truncate">{name}</span>
        <svg
          className={`w-3 h-3 text-fg-subtle transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel */}
      {open && mounted && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-surface-elevated border border-edge-base rounded-xl shadow-xl z-50 overflow-hidden">

          {/* User header */}
          <div className="px-4 py-3 flex items-center gap-3">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: 'rgb(var(--brand-600))' }}
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg-base truncate">{name}</p>
              <p className="text-xs text-fg-subtle truncate">@{profile.username}</p>
            </div>
          </div>

          <div className="h-px bg-edge-subtle mx-1" />

          {/* Settings */}
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-fg-secondary hover:bg-surface-hover transition-colors"
            >
              <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>

            {/* Appearance toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-fg-secondary hover:bg-surface-hover transition-colors"
            >
              {isDark ? (
                <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span>Appearance</span>
              <span className="ml-auto text-xs text-fg-subtle">{isDark ? 'Dark' : 'Light'}</span>
            </button>
          </div>

          <div className="h-px bg-edge-subtle mx-1" />

          {/* Sign out */}
          <div className="py-1">
            <form action={signOut}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-fg-secondary hover:bg-surface-hover transition-colors"
              >
                <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </form>
          </div>

        </div>
      )}
    </div>
  )
}
