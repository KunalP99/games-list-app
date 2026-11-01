import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isLoopbackCallback } from '@/lib/agent-auth'
import PairDeviceForm from './PairDeviceForm'

/**
 * The desktop app opens this page to get a device token.
 *
 * It runs inside the app's own window, which is why it looks like the rest of
 * the site: the user signs in exactly as they normally would, approves once,
 * and the token is handed back to the app over a loopback callback without
 * anybody copying anything.
 *
 * Deliberately outside the `(app)` route group — the desktop app's window is
 * a small, fixed-size popup for this one screen, not a page someone browses
 * away from, so the site's own nav bar has nothing to do here. That also
 * means this page no longer gets `(app)/layout.tsx`'s background/padding (or
 * its ThemeInitialiser, so the brand accent is the site default here rather
 * than the signed-in user's own colour) — supplied directly below instead.
 */
export default async function PairDevicePage({
  searchParams,
}: {
  searchParams: { callback?: string; label?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Not signed in: the normal login page. The app watches for the window to
  // land somewhere authenticated and brings it back here.
  if (!user) redirect('/login')

  const callback = searchParams.callback ?? ''
  const label = (searchParams.label ?? 'This PC').slice(0, 60)
  const valid = callback.length > 0 && isLoopbackCallback(callback)

  return (
    <div className="min-h-screen bg-surface-page px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-fg-base">Connect this PC</h1>
          <p className="text-sm text-fg-muted mt-1">
            So GamesList can log your hours while you play.
          </p>
        </div>

        {!valid ? (
          <div className="bg-surface-base border border-red-200 dark:border-red-800 rounded-xl p-6 space-y-3">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              This pairing link isn&apos;t valid.
            </p>
            <p className="text-sm text-fg-secondary leading-relaxed">
              A pairing link has to point back at the app running on your own
              computer. This one doesn&apos;t, so no token has been created.
              Open the GamesList app and try connecting again.
            </p>
            <Link href="/settings" className="inline-block text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400">
              Back to settings →
            </Link>
          </div>
        ) : (
          <PairDeviceForm label={label} callback={callback} />
        )}
      </div>
    </div>
  )
}
