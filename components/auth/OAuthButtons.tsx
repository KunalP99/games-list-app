'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Provider = 'google' | 'discord'

/**
 * "Continue with Google / Discord" (public edition). Supabase sends them to
 * the provider and back to /auth/callback, which signs them in. A first-time
 * account has no chosen username yet, so the app then asks for one at
 * /welcome. Each provider must be switched on in the Supabase project (Auth →
 * Providers); until then Supabase answers with an error, shown here.
 */
export default function OAuthButtons({ onError }: { onError: (message: string) => void }) {
  const [pending, setPending] = useState<Provider | null>(null)

  async function go(provider: Provider) {
    setPending(provider)
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setPending(null)
      onError(/not enabled|unsupported provider/i.test(error.message)
        ? `Signing in with ${provider === 'google' ? 'Google' : 'Discord'} isn’t set up yet.`
        : error.message)
    }
  }

  const btn = 'flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-edge-base bg-surface-base text-sm font-medium text-fg-base hover:bg-surface-hover disabled:opacity-60 transition-colors'

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => go('google')} disabled={pending !== null} className={btn}>
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.8 2.4 2.6 6.6 2.6 12s4.2 9.6 9.4 9.6c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
          </svg>
          {pending === 'google' ? 'Opening…' : 'Google'}
        </button>
        <button type="button" onClick={() => go('discord')} disabled={pending !== null} className={btn}>
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 -.3 13.6.1 18.1A19.9 19.9 0 0 0 6.2 21l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4c3.9 1.8 8.1 1.8 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6.1-2.9c.5-5.2-.8-9.8-3.6-13.7zM8.7 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm6.6 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
          </svg>
          {pending === 'discord' ? 'Opening…' : 'Discord'}
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-fg-subtle">
        <span className="h-px flex-1 bg-edge-base" />or with email<span className="h-px flex-1 bg-edge-base" />
      </div>
    </div>
  )
}
