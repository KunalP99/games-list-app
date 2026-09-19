'use client'

import { useState } from 'react'
import { updateProfile, updatePassword, updateAppearance, updateWheelEnabled } from './actions'
import { applyAccentPalette } from '@/lib/accent'
import type { Profile } from '@/lib/types'

const input = 'w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input'

function StatusMessage({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return (
    <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-red-600 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'}`}>
      {msg.text}
    </p>
  )
}

export default function SettingsForms({ profile, email }: { profile: Profile; email: string }) {
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [appearanceMsg, setAppearanceMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [appearanceLoading, setAppearanceLoading] = useState(false)

  const [wheelMsg, setWheelMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [wheelLoading, setWheelLoading] = useState(false)

  const profileData = profile as any
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(profileData.theme_preference ?? 'system')
  const [accent, setAccent] = useState<string>(profileData.accent_colour ?? '#ff5722')
  // Existing accounts predate the column, so treat a missing value as opted in.
  const [wheelEnabled, setWheelEnabled] = useState<boolean>(profileData.wheel_enabled ?? true)

  async function handleProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg(null)
    const result = await updateProfile(new FormData(e.currentTarget))
    setProfileMsg(result.success ? { ok: true, text: 'Profile updated.' } : { ok: false, text: result.error })
    setProfileLoading(false)
  }

  async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordLoading(true)
    setPasswordMsg(null)
    const result = await updatePassword(new FormData(e.currentTarget))
    setPasswordMsg(result.success ? { ok: true, text: 'Password updated.' } : { ok: false, text: result.error })
    if (result.success) (e.target as HTMLFormElement).reset()
    setPasswordLoading(false)
  }

  async function handleWheelToggle(next: boolean) {
    setWheelLoading(true)
    setWheelMsg(null)
    const result = await updateWheelEnabled(next)
    if (result.success) {
      setWheelEnabled(next)
      setWheelMsg({
        ok: true,
        text: next ? 'Wheel turns are back on.' : 'Wheel turns are off. Your turn is saved.',
      })
    } else {
      setWheelMsg({ ok: false, text: result.error })
    }
    setWheelLoading(false)
  }

  async function handleAppearance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAppearanceLoading(true)
    setAppearanceMsg(null)
    const result = await updateAppearance(new FormData(e.currentTarget))
    if (result.success) {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.classList.toggle('dark', prefersDark)
        localStorage.setItem('theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        localStorage.setItem('theme', theme)
      }
      applyAccentPalette(accent)
      setAppearanceMsg({ ok: true, text: 'Appearance saved.' })
    } else {
      setAppearanceMsg({ ok: false, text: result.error })
    }
    setAppearanceLoading(false)
  }

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Light',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
    },
    {
      value: 'system',
      label: 'System',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-6">

      {/* Profile */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Profile</h2>
        <form onSubmit={handleProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Display Name</label>
              <input
                name="display_name"
                defaultValue={profile.display_name ?? ''}
                className={input}
                placeholder="How others see your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Username</label>
              <input value={profile.username} disabled className={`${input} opacity-50 cursor-not-allowed`} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">Email</label>
            <input value={email} disabled className={`${input} opacity-50 cursor-not-allowed`} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={profileLoading}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {profileLoading ? 'Saving…' : 'Save Profile'}
            </button>
            <StatusMessage msg={profileMsg} />
          </div>
        </form>
      </section>

      {/* Security */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Security</h2>
        <form onSubmit={handlePassword} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">New Password</label>
              <input
                name="new_password"
                type="password"
                required
                minLength={6}
                className={input}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Confirm Password</label>
              <input
                name="confirm_password"
                type="password"
                required
                className={input}
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={passwordLoading}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {passwordLoading ? 'Updating…' : 'Update Password'}
            </button>
            <StatusMessage msg={passwordMsg} />
          </div>
        </form>
      </section>

      {/* Appearance */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Appearance</h2>
        <form onSubmit={handleAppearance} className="space-y-5">

          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">Default Theme</label>
            <div className="flex gap-2">
              {themeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    theme === opt.value
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'border-edge-input text-fg-secondary hover:border-edge-base hover:bg-surface-hover'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
            <input type="hidden" name="theme_preference" value={theme} />
          </div>

          {/* Accent colour */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">Accent Colour</label>
            <p className="text-xs text-fg-subtle mb-3">Used for your avatar and row highlights across the app.</p>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="color"
                  name="accent_colour"
                  value={accent}
                  onChange={e => { setAccent(e.target.value); applyAccentPalette(e.target.value) }}
                  className="w-10 h-10 rounded-lg border border-edge-input cursor-pointer bg-surface-input p-0.5"
                />
              </div>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                style={{ backgroundColor: accent }}
              >
                {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-fg-muted font-mono">{accent}</span>
              <button
                type="button"
                onClick={() => { setAccent('#ff5722'); applyAccentPalette('#ff5722') }}
                className="text-xs text-fg-subtle hover:text-fg-secondary transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={appearanceLoading}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {appearanceLoading ? 'Saving…' : 'Save Appearance'}
            </button>
            <StatusMessage msg={appearanceMsg} />
          </div>
        </form>
      </section>

      {/* Wheel */}
      <section className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">Wheel</h2>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg-secondary">Wheel turns</p>
            <p className="text-xs text-fg-subtle mt-1 leading-relaxed">
              {wheelEnabled
                ? 'Turn this off to stop taking wheel turns. The Wheel page and your current turn will be hidden, but you’ll keep earning tickets as normal, and your turn will be waiting if you come back.'
                : 'Wheel turns are off. You’re still earning tickets as normal, and your current turn is saved — turn this back on to pick up exactly where you left off.'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={wheelEnabled}
            aria-label="Wheel turns"
            disabled={wheelLoading}
            onClick={() => handleWheelToggle(!wheelEnabled)}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
              wheelEnabled ? 'bg-brand-600' : 'bg-surface-active border border-edge-base'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                wheelEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <StatusMessage msg={wheelMsg} />
      </section>

    </div>
  )
}
