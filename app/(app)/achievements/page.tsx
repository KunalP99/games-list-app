import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  levelProgress,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/achievements'

export default async function AchievementsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('xp')
    .eq('id', user.id)
    .single() as { data: { xp: number } | null }

  const { data: unlockedRows } = await (supabase.from('user_achievements') as any)
    .select('achievement_id, unlocked_at')
    .eq('user_id', user.id) as { data: { achievement_id: string; unlocked_at: string }[] | null }

  const unlocked = new Map((unlockedRows ?? []).map(r => [r.achievement_id, r.unlocked_at]))
  const xp = profile?.xp ?? 0
  const progress = levelProgress(xp)

  // Group achievements by category, in defined order
  const categoryOrder: AchievementCategory[] = ['completion', 'hours', 'tickets', 'perfection', 'variety', 'dedication', 'wheel', 'misc']
  const groups = categoryOrder.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: ACHIEVEMENTS.filter(a => a.category === cat),
  }))

  const totalUnlocked = unlocked.size
  const totalAchievements = ACHIEVEMENTS.length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Achievements</h1>
        <p className="mt-1 text-fg-muted text-sm">Earn XP, level up, and collect milestones.</p>
      </div>

      {/* XP / Level card */}
      <div className="bg-surface-base border border-edge-base rounded-xl p-5">
        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Level</p>
            <p className="text-3xl font-bold text-fg-base leading-none mt-1">{progress.level}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Total XP</p>
            <p className="text-lg font-semibold text-fg-base tabular-nums">{xp.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-2 w-full bg-surface-active rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-700 rounded-full transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
          <span>{progress.intoLevel} / {progress.span} XP</span>
          <span>Next level at {progress.nextThreshold.toLocaleString()} XP</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-surface-base border border-edge-base rounded-xl p-4 flex items-center justify-between">
        <p className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg-base">{totalUnlocked}</span>
          <span className="text-fg-muted"> / {totalAchievements} unlocked</span>
        </p>
        <div className="h-1.5 flex-1 ml-4 bg-surface-active rounded-full overflow-hidden max-w-[240px]">
          <div
            className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${(totalUnlocked / totalAchievements) * 100}%` }}
          />
        </div>
      </div>

      {/* Categories */}
      {groups.map(group => (
        <section key={group.category}>
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map(ach => {
              const isUnlocked = unlocked.has(ach.id)
              const unlockedAt = unlocked.get(ach.id)
              return (
                <AchievementCard
                  key={ach.id}
                  unlocked={isUnlocked}
                  unlockedAt={unlockedAt}
                  achievement={ach}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

const RARITY_TINT: Record<AchievementRarity, string> = {
  common:   'border-edge-base',
  uncommon: 'border-blue-500/40',
  rare:     'border-accent2-500/50',
  epic:     'border-amber-500/60',
}

const RARITY_BADGE: Record<AchievementRarity, string> = {
  common:   'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  uncommon: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  rare:     'bg-accent2-50 text-accent2-700 dark:bg-accent2-900/30 dark:text-accent2-300',
  epic:     'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

function AchievementCard({
  achievement,
  unlocked,
  unlockedAt,
}: {
  achievement: { id: string; name: string; description: string; icon: string; rarity: AchievementRarity; xp: number }
  unlocked: boolean
  unlockedAt?: string
}) {
  return (
    <div
      className={`
        relative bg-surface-base border rounded-xl p-4 flex gap-3 transition-all
        ${unlocked ? RARITY_TINT[achievement.rarity] : 'border-edge-subtle opacity-55 grayscale'}
      `}
    >
      <div className="text-3xl shrink-0 leading-none">{achievement.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-semibold text-fg-base">{achievement.name}</p>
          <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${RARITY_BADGE[achievement.rarity]}`}>
            {achievement.rarity}
          </span>
        </div>
        <p className="text-xs text-fg-muted leading-snug">{achievement.description}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">+{achievement.xp} XP</span>
          {unlocked && unlockedAt && (
            <span className="text-[10px] text-fg-subtle">
              {new Date(unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {!unlocked && (
            <span className="text-[10px] text-fg-subtle">🔒 Locked</span>
          )}
        </div>
      </div>
    </div>
  )
}
