'use client'

import { useState } from 'react'
import { signIn, signUp } from './actions'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')

  function switchMode(next: 'signin' | 'signup') {
    setMode(next)
    setError(null)
    setMessage(null)
    setConfirmPassword('')
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
  }

  return (
    <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <h1 className="font-orbitron text-2xl font-bold tracking-tight">
              <span className="text-fg-base">Games</span><span className="text-brand-600 dark:text-brand-400">List</span>
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
          <p className="text-sm text-fg-muted">Track games. Earn tickets. Spin the wheel.</p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
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
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
              placeholder="••••••••"
            />
          </div>

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
          <p className="mt-4 text-xs text-fg-subtle text-center">Minimum 6 character password.</p>
        )}
      </div>
    </div>
  )
}
