'use client'

import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile, the bot check on the public edition's sign-in,
 * sign-up and password-reset forms. The widget puts its token in its own
 * hidden `cf-turnstile-response` field inside the form, which the server
 * action reads and passes to Supabase; Supabase verifies it with the secret
 * key set on the project (Auth → Captcha). (A copy in a field of our own went
 * stale when the login form switched between Sign In and Create Account, so
 * the widget's field is the one source.)
 *
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY (local development) it uses
 * Cloudflare's always-passes test key, and the local Supabase stack has
 * captcha switched off, so nothing is actually verified there.
 *
 * Tokens are single-use: remount it (change its `key`) after each submit.
 */

const TEST_SITE_KEY = '1x00000000000000000000AA'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export default function Turnstile({ onToken }: { onToken?: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    const set = (token: string | null) => onToken?.(token)
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return
      widgetId = window.turnstile.render(box.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY,
        theme: 'auto',
        size: 'flexible',
        callback: (token: string) => set(token),
        'expired-callback': () => set(null),
        'error-callback': () => set(null),
      })
    }).catch(() => set(null))
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={box} className="min-h-[65px]" />
  )
}
