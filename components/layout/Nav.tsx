'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { signOut } from '@/app/(auth)/login/actions'
import type { Profile } from '@/lib/types'
import UserDropdown from '@/components/layout/UserDropdown'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/games', label: 'My Games' },
  { href: '/users', label: 'Friends' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/wheel', label: 'Wheel' },
  { href: '/achievements', label: 'Achievements' },
]

export default function Nav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ticketAnimating, setTicketAnimating] = useState(false)
  const prevBalance = useRef(profile.ticket_balance)

  useEffect(() => {
    if (profile.ticket_balance > prevBalance.current) {
      setTicketAnimating(false)
      requestAnimationFrame(() => {
        setTicketAnimating(true)
        setTimeout(() => setTicketAnimating(false), 450)
      })
    }
    prevBalance.current = profile.ticket_balance
  }, [profile.ticket_balance])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <>
      {/* Floating pill wrapper — matches max-w-6xl content width */}
      <div className="fixed top-3 inset-x-0 z-30 px-4 pointer-events-none">
        <header className="pointer-events-auto w-full max-w-6xl mx-auto flex items-center justify-between h-11 px-4 rounded-full backdrop-blur-xl bg-white/60 dark:bg-black/50 border border-zinc-200/40 dark:border-white/[0.06] shadow-md shadow-black/[0.10] dark:shadow-black/50">

          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-1.5 rounded-full text-fg-muted hover:text-fg-base hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm shadow-brand-500/20">
                <svg viewBox="0 0 16 16" fill="white" className="w-3.5 h-3.5">
                  <polygon points="1.5,3.5 1.5,12.5 8.5,8"/>
                  <rect x="10.5" y="3.5" width="4.5" height="2" rx="0.6"/>
                  <rect x="10.5" y="7" width="4.5" height="2" rx="0.6"/>
                  <rect x="10.5" y="10.5" width="4.5" height="2" rx="0.6"/>
                </svg>
              </div>
              <span className="font-orbitron text-sm font-bold tracking-tight">
                <span className="text-fg-base">Games</span><span className="text-brand-600 dark:text-brand-400">List</span>
              </span>
            </Link>
          </div>

          {/* Center: desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    active
                      ? 'bg-black/[0.06] dark:bg-white/10 text-fg-base font-medium'
                      : 'text-fg-muted hover:text-fg-base hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Right: ticket balance + user dropdown */}
          <div className="flex items-center gap-2.5">
            <span className={`hidden sm:flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-0.5 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300 ${ticketAnimating ? 'animate-ticket-gain' : ''}`}>
              🎟️ {profile.ticket_balance}
            </span>
            <UserDropdown profile={profile} />
          </div>
        </header>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-surface-elevated shadow-xl flex flex-col transition-transform duration-300 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-edge-subtle">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center shadow-sm shadow-brand-500/20">
              <svg viewBox="0 0 16 12" fill="white" className="w-4 h-3">
                <rect x="1" y="4.75" width="4.5" height="1.5" rx=".4"/>
                <rect x="2.75" y="3" width="1.5" height="5" rx=".4"/>
                <circle cx="8" cy="6" r="0.9" fillOpacity="0.6"/>
                <circle cx="11" cy="3.5" r="1"/>
                <circle cx="13" cy="6" r="1"/>
                <circle cx="11" cy="8.5" r="1"/>
                <circle cx="9" cy="6" r="1"/>
              </svg>
            </div>
            <span className="font-orbitron text-base font-bold tracking-tight">
              <span className="text-fg-base">Games</span><span className="text-brand-600 dark:text-brand-400">List</span>
            </span>
          </Link>
          <button
            className="p-1.5 rounded-md text-fg-subtle hover:text-fg-secondary hover:bg-surface-active transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium mb-0.5 transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-fg-secondary hover:text-fg-base hover:bg-surface-hover'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar footer: user info + settings + sign out */}
        <div className="border-t border-edge-subtle px-4 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-secondary font-medium">
              {profile.display_name ?? profile.username}
            </span>
            <span className={`flex items-center gap-1 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-0.5 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300 ${ticketAnimating ? 'animate-ticket-gain' : ''}`}>
              🎟️ {profile.ticket_balance}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-xs text-fg-subtle hover:text-fg-secondary transition-colors">
              Settings
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-xs text-fg-subtle hover:text-fg-secondary transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  )
}
