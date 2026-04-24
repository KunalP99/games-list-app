'use client'

import { useState } from 'react'
import { signIn, signUp } from './actions'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = mode === 'signin' ? await signIn(formData) : await signUp(formData)

    setLoading(false)

    if (result && 'error' in result) setError(result.error as string)
    if (result && 'success' in result) setMessage(result.success as string)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-violet-600">GamesList</h1>
          <p className="mt-2 text-sm text-zinc-500">Track games. Earn tickets. Spin the wheel.</p>
        </div>

        {/* Tab toggle */}
        <div className="flex border border-zinc-200 rounded-lg p-1 mb-6">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); setMessage(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'signin'
                ? 'bg-violet-600 text-white'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); setMessage(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'signup'
                ? 'bg-violet-600 text-white'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {message && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode === 'signup' && (
          <p className="mt-4 text-xs text-zinc-400 text-center">
            You&apos;ll receive a confirmation email. Minimum 6 character password.
          </p>
        )}
      </div>
    </div>
  )
}
