'use client'

import { useState } from 'react'
import { approveDevicePairing } from '../../actions'

export default function PairDeviceForm({ label, callback }: { label: string; callback: string }) {
  const [name, setName] = useState(label)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleAllow() {
    setLoading(true)
    setError(null)
    const result = await approveDevicePairing(name, callback)
    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return
    }
    // Hands the token to the app's local listener, which closes this window.
    setDone(true)
    window.location.href = result.data.redirectTo
  }

  if (done) {
    return (
      <div className="bg-surface-base border border-edge-base rounded-xl p-6 text-center space-y-2">
        <p className="text-4xl">✅</p>
        <p className="font-medium text-fg-secondary">Connected</p>
        <p className="text-sm text-fg-subtle">You can close this window and go back to the app.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-6 space-y-4">
      <div className="space-y-2">
        <label htmlFor="device-name" className="block text-sm font-medium text-fg-secondary">
          Name this device
        </label>
        <input
          id="device-name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
          className="w-full px-3 py-2 border border-edge-input rounded-lg text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface-input"
        />
      </div>

      <div className="rounded-lg bg-surface-sunken p-3 space-y-1.5">
        <p className="text-xs font-medium text-fg-secondary">What this device will be able to do</p>
        <ul className="text-xs text-fg-subtle space-y-1 leading-relaxed">
          <li>• Add hours to games you have set to <span className="font-medium text-fg-secondary">Playing</span></li>
          <li>• See which games are set to Playing, to recognise them</li>
          <li>• Nothing else — completed and backlog games are never changed</li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAllow}
          disabled={loading || name.trim().length === 0}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Connecting…' : 'Allow'}
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="px-4 py-2 border border-edge-base text-fg-secondary text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </p>
      )}

      <p className="text-xs text-fg-subtle">
        You can revoke this device at any time from Settings → Devices.
      </p>
    </div>
  )
}
