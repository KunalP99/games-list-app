'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DASHBOARD_LAYOUT_COOKIE, type DashboardLayout } from '@/lib/dashboard'

/**
 * Flips the dashboard between the classic and new layouts. The choice is a
 * cookie (a year, like the games list's view), read by the dashboard page on
 * the server, so a refresh is all it takes to swap.
 */
export default function DashboardLayoutSwitch({ to }: { to: DashboardLayout }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function flip() {
    document.cookie = `${DASHBOARD_LAYOUT_COOKIE}=${to}; path=/; max-age=31536000; SameSite=Lax`
    startTransition(() => router.refresh())
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-fg-secondary border border-edge-base bg-surface-base hover:bg-surface-hover hover:text-fg-base disabled:opacity-60 transition-colors"
    >
      {pending ? 'Switching…' : to === 'new' ? 'Try the new dashboard' : 'Back to classic'}
    </button>
  )
}
