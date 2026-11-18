'use client'

import { useEffect, useRef, useState } from 'react'
import type { UsernameStatus } from '@/lib/data/usernames'
import { USERNAME_MAX } from '@/lib/username'

const input = 'w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input'

/**
 * A username box that lowercases as you type and checks the name with the
 * server after a short pause: free ✓, taken (with alternatives to click), or
 * not allowed (with the rule it breaks). `check` is a server action, so the
 * same rules run here as on submit. The answer is advisory; the submit
 * re-checks, and the database's unique index has the final say.
 */
export default function UsernameField({
  check,
  name = 'username',
  defaultValue = '',
  current,
  disabled = false,
  onStatus,
}: {
  check: (raw: string) => Promise<UsernameStatus>
  name?: string
  defaultValue?: string
  /** Your own current username, which counts as fine without a check (Settings). */
  current?: string
  disabled?: boolean
  onStatus?: (ok: boolean) => void
}) {
  const [value, setValue] = useState(defaultValue)
  const [status, setStatus] = useState<UsernameStatus | 'checking' | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const v = value.trim()
    if (!v || v === current) {
      setStatus(null)
      onStatus?.(v === current && v !== '')
      return
    }
    setStatus('checking')
    onStatus?.(false)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const result = await check(v).catch((): UsernameStatus => ({ status: 'invalid', error: 'Couldn’t check that just now.' }))
      if (mine !== seq.current) return // a newer keystroke has taken over
      setStatus(result)
      onStatus?.(result.status === 'available')
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, current])

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-subtle">@</span>
        <input
          id={name}
          name={name}
          type="text"
          required
          disabled={disabled}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          value={value}
          onChange={e => setValue(e.target.value.toLowerCase().replace(/\s/g, ''))}
          className={`${input} pl-7 disabled:opacity-60`}
          placeholder="yourname"
          aria-describedby={`${name}-status`}
        />
      </div>
      <div id={`${name}-status`} aria-live="polite" className="mt-1 min-h-[1.25rem] text-xs">
        {status === 'checking' && <span className="text-fg-subtle">Checking…</span>}
        {status && status !== 'checking' && status.status === 'available' && (
          <span className="text-emerald-600 dark:text-emerald-400">✓ @{status.username} is available</span>
        )}
        {status && status !== 'checking' && status.status === 'invalid' && (
          <span className="text-red-600 dark:text-red-400">{status.error}</span>
        )}
        {status && status !== 'checking' && status.status === 'taken' && (
          <span className="text-red-600 dark:text-red-400">
            @{status.username} is taken.
            {status.suggestions.length > 0 && (
              <>
                {' '}Try{' '}
                {status.suggestions.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => setValue(s)} className="font-medium underline underline-offset-2 text-brand-600 dark:text-brand-400 hover:text-brand-700">
                      {s}
                    </button>
                  </span>
                ))}
              </>
            )}
          </span>
        )}
        {!status && !current && <span className="text-fg-subtle">3–20 letters, numbers or underscores. Starts with a letter.</span>}
      </div>
    </div>
  )
}
