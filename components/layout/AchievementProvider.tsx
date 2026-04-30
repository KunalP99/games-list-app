'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { UnlockedAchievement, AchievementRarity } from '@/lib/achievements'

const EXIT_DURATION_MS = 350
const TOAST_DURATION_MS = 5000

type ToastEntry = UnlockedAchievement & { _toastId: string; _exiting: boolean }

type AchievementContextValue = {
  enqueue: (achievements: UnlockedAchievement[]) => void
}

const AchievementContext = createContext<AchievementContextValue | null>(null)

export function useAchievements() {
  const ctx = useContext(AchievementContext)
  if (!ctx) throw new Error('useAchievements must be used inside AchievementProvider')
  return ctx
}

export default function AchievementProvider({
  children,
  initialAchievements,
}: {
  children: React.ReactNode
  initialAchievements: UnlockedAchievement[]
}) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const autoTimers = useRef<Set<string>>(new Set())

  const beginDismiss = useCallback((id: string) => {
    // Prevent double-triggering
    if (exitTimers.current.has(id)) return
    // Mark as exiting to trigger CSS animation
    setToasts(prev => prev.map(t => t._toastId === id ? { ...t, _exiting: true } : t))
    // Remove from DOM after animation completes
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t._toastId !== id))
      exitTimers.current.delete(id)
    }, EXIT_DURATION_MS)
    exitTimers.current.set(id, timer)
  }, [])

  const enqueue = useCallback((achievements: UnlockedAchievement[]) => {
    if (achievements.length === 0) return
    const stamped = achievements.map(a => ({
      ...a,
      _toastId: `${a.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      _exiting: false,
    }))
    setToasts(prev => [...prev, ...stamped])
  }, [])

  // Pop initial flash achievements once on mount
  useEffect(() => {
    if (initialAchievements.length === 0) return
    enqueue(initialAchievements)
    fetch('/api/achievement-flash', { method: 'DELETE' }).catch(() => { /* best-effort */ })
  }, [initialAchievements, enqueue])

  // Schedule auto-dismiss for any newly added toasts (runs once per toast)
  useEffect(() => {
    toasts.forEach(t => {
      if (autoTimers.current.has(t._toastId) || t._exiting) return
      autoTimers.current.add(t._toastId)
      setTimeout(() => {
        beginDismiss(t._toastId)
        autoTimers.current.delete(t._toastId)
      }, TOAST_DURATION_MS)
    })
  }, [toasts, beginDismiss])

  return (
    <AchievementContext.Provider value={{ enqueue }}>
      {children}
      {/* Toast stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col-reverse gap-3 pointer-events-none max-w-[360px]">
        {toasts.map(t => (
          <AchievementToast
            key={t._toastId}
            achievement={t}
            exiting={t._exiting}
            onDismiss={() => beginDismiss(t._toastId)}
          />
        ))}
      </div>
    </AchievementContext.Provider>
  )
}

const RARITY_STYLES: Record<AchievementRarity, { bar: string; badge: string; label: string }> = {
  common:   { bar: 'bg-zinc-400 dark:bg-zinc-500',   badge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', label: 'Common' },
  uncommon: { bar: 'bg-blue-500',                     badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: 'Uncommon' },
  rare:     { bar: 'bg-accent2-600',                  badge: 'bg-accent2-50 text-accent2-700 dark:bg-accent2-900/30 dark:text-accent2-300', label: 'Rare' },
  epic:     { bar: 'bg-gradient-to-b from-yellow-400 via-amber-500 to-orange-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: 'Epic' },
}

function AchievementToast({
  achievement,
  exiting,
  onDismiss,
}: {
  achievement: UnlockedAchievement
  exiting: boolean
  onDismiss: () => void
}) {
  const styles = RARITY_STYLES[achievement.rarity]

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`pointer-events-auto group relative flex items-stretch gap-3 bg-surface-base border border-edge-base rounded-xl shadow-lg overflow-hidden text-left hover:bg-surface-hover transition-colors w-[320px] ${
        exiting ? 'animate-achievement-dismiss' : 'animate-achievement-pop'
      }`}
    >
      {/* Rarity strip */}
      <div className={`w-1.5 ${styles.bar}`} />
      <div className="flex items-center gap-3 py-3 pr-4 flex-1 min-w-0">
        <div className="text-3xl shrink-0 leading-none">{achievement.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Achievement Unlocked</p>
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${styles.badge}`}>
              {styles.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-fg-base truncate">{achievement.name}</p>
          <p className="text-xs text-fg-muted truncate">{achievement.description}</p>
        </div>
        <div className="shrink-0 text-xs font-bold text-brand-600 dark:text-brand-400 tabular-nums">
          +{achievement.xp} XP
        </div>
      </div>
    </button>
  )
}
