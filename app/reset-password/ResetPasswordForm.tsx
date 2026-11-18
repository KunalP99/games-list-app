'use client'

import { useState } from 'react'
import { resetPassword } from '@/app/(auth)/login/actions'
import { authInput, authButton, authError } from '@/components/auth/AuthShell'

export default function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await resetPassword(new FormData(e.currentTarget))
    setLoading(false)
    if (result && 'error' in result && result.error) setError(result.error)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-fg-secondary mb-1">New password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={authInput} placeholder="••••••••" />
      </div>
      <div>
        <label htmlFor="confirm_password" className="block text-sm font-medium text-fg-secondary mb-1">Confirm new password</label>
        <input id="confirm_password" name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className={authInput} placeholder="••••••••" />
      </div>
      {error && <p className={authError}>{error}</p>}
      <button type="submit" disabled={loading} className={authButton}>{loading ? 'Saving…' : 'Save new password'}</button>
    </form>
  )
}
