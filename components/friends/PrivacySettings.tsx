'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PRIVACY_ITEMS, PRIVACY_CHOICES, type PrivacyKey } from '@/lib/friends'
import type { PrivacySetting } from '@/lib/types'
import type { PersonSummary } from '@/lib/data/friends'
import { updatePrivacy } from '@/app/(app)/settings/actions'
import { unblockUser } from '@/app/(app)/friends/actions'
import PersonAvatar from './PersonAvatar'

/**
 * Settings → Privacy (public edition): who may see each part of you
 * (Everyone / Friends / Only me, saved as soon as it's picked), and the people
 * you've blocked. The database enforces the same choices (db/friends.sql).
 */
export default function PrivacySettings({
  values: initial,
  blocked,
}: {
  values: Record<PrivacyKey, PrivacySetting>
  blocked: PersonSummary[]
}) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState<PrivacyKey | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [unblocking, startUnblock] = useTransition()

  async function choose(key: PrivacyKey, value: PrivacySetting) {
    if (values[key] === value) return
    const before = values[key]
    setValues(v => ({ ...v, [key]: value }))
    setSaving(key)
    setMessage(null)
    const r = await updatePrivacy(key, value)
    setSaving(null)
    if (r.success) {
      setMessage({ ok: true, text: 'Saved.' })
    } else {
      setValues(v => ({ ...v, [key]: before }))
      setMessage({ ok: false, text: r.error })
    }
  }

  return (
    <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-5" aria-labelledby="privacy-heading">
      <div>
        <h2 id="privacy-heading" className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Privacy</h2>
        <p className="text-xs text-fg-subtle mt-1 leading-relaxed">
          Who can see each part of you. You always see all of your own. Anyone can still find you by name and send you a friend request.
        </p>
      </div>

      <ul className="space-y-4">
        {PRIVACY_ITEMS.map(item => (
          <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-[1_1_220px]">
              <p className="text-sm font-medium text-fg-secondary" id={`${item.key}-label`}>{item.label}</p>
              <p className="text-xs text-fg-subtle mt-0.5">{item.description}</p>
            </div>
            <div role="radiogroup" aria-labelledby={`${item.key}-label`} className="inline-flex shrink-0 rounded-lg border border-edge-base bg-surface-sunken p-0.5">
              {PRIVACY_CHOICES.map(choice => {
                const selected = values[item.key] === choice.value
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving === item.key}
                    onClick={() => choose(item.key, choice.value)}
                    className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors disabled:opacity-60 ${
                      selected ? 'bg-surface-base text-fg-base shadow-sm' : 'text-fg-muted hover:text-fg-base'
                    }`}
                  >
                    {choice.label}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>

      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}

      <div className="border-t border-edge-subtle pt-4">
        <p className="text-sm font-medium text-fg-secondary">Blocked people</p>
        {blocked.length === 0 ? (
          <p className="text-xs text-fg-subtle mt-1">Nobody. You can block someone from the ⋯ menu on their profile.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {blocked.map(p => (
              <li key={p.id} className="flex items-center gap-2.5">
                <PersonAvatar name={p.displayName} accentColour={p.accentColour} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-fg-base truncate">{p.displayName}</span>
                  <span className="block text-xs text-fg-muted truncate">@{p.username}</span>
                </span>
                <button
                  type="button"
                  disabled={unblocking}
                  onClick={() => startUnblock(async () => { await unblockUser(p.id, p.username); router.refresh() })}
                  className="h-8 px-3 rounded-lg border border-edge-base text-xs font-semibold text-fg-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
