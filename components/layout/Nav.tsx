'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'
import type { Profile } from '@/lib/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/games', label: 'My Games' },
  { href: '/users', label: 'Friends' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/wheel', label: 'Wheel' },
  { href: '/changelog', label: 'Changelog' },
]

export default function Nav({ profile }: { profile: Profile }) {
  const pathname = usePathname()

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-violet-600">
          GamesList
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  active
                    ? 'bg-violet-50 text-violet-700 font-medium'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side: ticket balance + user */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3 py-1">
            🎟️ {profile.ticket_balance}
          </span>
          <span className="hidden sm:block text-sm text-zinc-500">{profile.display_name ?? profile.username}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex border-t border-zinc-100 overflow-x-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-shrink-0 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                active
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
