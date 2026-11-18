'use client'

import { useState } from 'react'
import { setInitialUsername, checkMyUsername } from './actions'
import UsernameField from '@/components/auth/UsernameField'
import { authInput, authButton, authError } from '@/components/auth/AuthShell'

export default function WelcomeForm({ defaultUsername, defaultDisplayName }: { defaultUsername: string; defaultDisplayName: string }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await setInitialUsername(new FormData(e.currentTarget))
    setLoading(false)
    if (result && 'error' in result && result.error) setError(result.error)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-fg-secondary mb-1">Username</label>
        <UsernameField check={checkMyUsername} defaultValue={defaultUsername} />
      </div>
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-fg-secondary mb-1">
          Display name <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <input id="display_name" name="display_name" type="text" maxLength={50} defaultValue={defaultDisplayName} className={authInput} placeholder="How your name shows on your profile" />
      </div>
      {error && <p className={authError}>{error}</p>}
      <button type="submit" disabled={loading} className={authButton}>{loading ? 'Saving…' : 'Continue'}</button>
    </form>
  )
}
