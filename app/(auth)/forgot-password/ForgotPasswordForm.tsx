'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '../login/actions'
import Turnstile from '@/components/auth/Turnstile'
import { authInput, authButton, authError, authSuccess } from '@/components/auth/AuthShell'

export default function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await requestPasswordReset(new FormData(e.currentTarget))
    setLoading(false)
    setCaptchaKey(k => k + 1)
    if ('error' in result && result.error) setError(result.error)
    if ('success' in result && result.success) setMessage(result.success)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-fg-secondary mb-1">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={authInput} placeholder="you@example.com" />
      </div>
      <Turnstile key={captchaKey} />
      {error && <p className={authError}>{error}</p>}
      {message && <p className={authSuccess}>{message}</p>}
      <button type="submit" disabled={loading} className={authButton}>{loading ? 'Sending…' : 'Send reset link'}</button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Back to sign in</Link>
      </p>
    </form>
  )
}
