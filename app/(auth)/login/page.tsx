'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { signIn, signUp, checkUsername } from './actions'
import Wordmark from '@/components/layout/Wordmark'
import { BRAND, FEATURES } from '@/lib/edition'
import UsernameField from '@/components/auth/UsernameField'
import Turnstile from '@/components/auth/Turnstile'
import OAuthButtons from '@/components/auth/OAuthButtons'

// The public edition's sign-up is built for strangers (lib/edition.ts
// `secureAuth`): a chosen username, a stronger password, a Turnstile bot
// check, Google/Discord, and "Forgot password?". The friends edition keeps its
// name/email/password form exactly as it was.
const SECURE = FEATURES.secureAuth

// Messages for errors that come back in the address (?error=…), e.g. from an
// expired confirmation or reset link.
const URL_ERRORS: Record<string, string> = {
  auth_callback_failed: 'That link has expired or was already used. Try again.',
}

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Turnstile tokens are single-use, so the widget is remounted after each try.
  const [captchaKey, setCaptchaKey] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('error')
    const description = params.get('error_description')
    if (code) setError(URL_ERRORS[code] ?? description ?? 'Something went wrong signing you in. Try again.')
  }, [])

  function switchMode(next: 'signin' | 'signup') {
    setMode(next)
    setError(null)
    setMessage(null)
    setConfirmPassword('')
    // Don't carry a revealed password across a mode switch.
    setShowPassword(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    const formData = new FormData(e.currentTarget)

    if (mode === 'signup') {
      const password = formData.get('password') as string
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setLoading(true)
    const result = mode === 'signin' ? await signIn(formData) : await signUp(formData)
    setLoading(false)

    if (result && 'error' in result) setError(result.error as string)
    if (result && 'success' in result) setMessage(result.success as string)
    if (SECURE) setCaptchaKey(k => k + 1)
  }

  return (
    <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <h1 className="font-orbitron text-2xl font-bold tracking-tight">
              <Wordmark />
            </h1>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm shadow-brand-500/20">
              <svg viewBox="0 0 16 16" fill="white" className="w-4 h-4">
                <polygon points="2.5,4.5 2.5,11.5 7.5,8"/>
                <rect x="9.5" y="4.5" width="4" height="1.7" rx="0.5"/>
                <rect x="9.5" y="7.15" width="4" height="1.7" rx="0.5"/>
                <rect x="9.5" y="9.8" width="4" height="1.7" rx="0.5"/>
              </svg>
            </div>
          </div>
          <p className="text-sm text-fg-muted">{BRAND.tagline}</p>
        </div>

        {/* Tab toggle */}
        <div className="flex border border-edge-base rounded-lg p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'signin' ? 'bg-brand-600 text-white' : 'text-fg-muted hover:text-fg-base'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'signup' ? 'bg-brand-600 text-white' : 'text-fg-muted hover:text-fg-base'
            }`}
          >
            Create Account
          </button>
        </div>

        {SECURE && <div className="mb-4"><OAuthButtons onError={setError} /></div>}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && SECURE && (
            <>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-fg-secondary mb-1">Username</label>
                <UsernameField check={checkUsername} />
              </div>
              <div>
                <label htmlFor="display_name" className="block text-sm font-medium text-fg-secondary mb-1">
                  Display name <span className="font-normal text-fg-subtle">(optional)</span>
                </label>
                <input
                  id="display_name"
                  name="display_name"
                  type="text"
                  maxLength={50}
                  autoComplete="name"
                  className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
                  placeholder="How your name shows on your profile"
                />
              </div>
            </>
          )}
          {mode === 'signup' && !SECURE && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-fg-secondary mb-1">Name</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-fg-secondary mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-fg-secondary mb-1">Password</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={SECURE && mode === 'signup' ? 8 : 6}
                // pr-10 keeps typed text clear of the toggle sitting inside the field.
                className="w-full px-3 py-2 pr-10 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                // The label states the action, and aria-pressed carries the
                // current state, so a screen reader never announces the field
                // as revealed when it isn't.
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                aria-controls="password"
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-fg-subtle hover:text-fg-secondary focus:outline-none focus:text-fg-secondary rounded-r-lg"
              >
                {showPassword ? (
                  // Eye with a slash — currently visible, click to hide.
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  // Plain eye — currently hidden, click to reveal.
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {SECURE && mode === 'signin' && (
            <div className="-mt-2 text-right">
              <Link href="/forgot-password" className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Forgot password?</Link>
            </div>
          )}

          {/* Confirm password — signup only */}
          {mode === 'signup' && (
            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-fg-secondary mb-1">Confirm Password</label>
              <input
                id="confirm_password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
                placeholder="••••••••"
              />
            </div>
          )}

          {/* Remember me — signin only */}
          {mode === 'signin' && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                name="remember_me"
                className="w-4 h-4 rounded border-edge-input text-brand-600 focus:ring-brand-500 bg-surface-input accent-brand-600"
              />
              <span className="text-sm text-fg-secondary">Remember me</span>
            </label>
          )}

          {SECURE && <Turnstile key={captchaKey} />}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
              {error}
            </p>
          )}

          {message && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode === 'signup' && (
          <p className="mt-4 text-xs text-fg-subtle text-center">
            {SECURE ? 'At least 8 characters, with a letter and a number.' : 'Minimum 6 character password.'}
          </p>
        )}
      </div>
    </div>
  )
}
