'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { checkMyUsername, updateUsername } from '@/app/welcome/actions'
import { canChangeUsername } from '@/lib/username'
import UsernameField from '@/components/auth/UsernameField'

/**
 * Changing your username in Settings (public edition): once every 30 days.
 * On cooldown it shows the name read-only with the date it unlocks. Sits
 * inside the profile form, so its button is type="button" and its field is
 * named so the profile save ignores it.
 */
export default function UsernameSetting({ username, changedAt }: { username: string; changedAt: string | null }) {
  const router = useRouter()
  const [current, setCurrent] = useState(username)
  const [ready, setReady] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const allowed = canChangeUsername(changedAt)

  if (!allowed.ok) {
    const when = allowed.nextAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
    return (
      <div>
        <input value={current} disabled className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base bg-surface-input opacity-50 cursor-not-allowed" />
        <p className="mt-1 text-xs text-fg-subtle">You can change your username again on {when}.</p>
      </div>
    )
  }

  function save() {
    const input = document.getElementById('new_username') as HTMLInputElement | null
    const value = input?.value ?? ''
    setMsg(null)
    startTransition(async () => {
      const result = await updateUsername(value)
      if (!result.success) { setMsg({ ok: false, text: result.error }); return }
      setCurrent(result.username)
      setReady(false)
      setMsg({ ok: true, text: 'Username changed. You can change it again in 30 days.' })
      router.refresh()
    })
  }

  return (
    <div>
      <UsernameField check={checkMyUsername} name="new_username" defaultValue={current} current={current} onStatus={setReady} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!ready || pending}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-edge-base bg-surface-base text-fg-base hover:bg-surface-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Change username'}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</span>}
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">You can change it once every 30 days. Old links to your profile keep working.</p>
    </div>
  )
}
