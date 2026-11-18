import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getNextAchievement, levelProgress } from '@/lib/achievements'

/**
 * Your level and the achievement you're closest to, in the bold accent card
 * the wheel turn uses in the friends edition. Shown in its place in an
 * edition without the wheel (lib/edition.ts).
 *
 * Streamed in its own Suspense boundary: the next achievement needs the same
 * stats read as unlocking them, which is the heaviest thing on this card.
 */
export default async function LevelCard({ userId, xp }: { userId: string; xp: number }) {
  const progress = levelProgress(xp)
  const next = await getNextAchievement(createClient(), userId).catch(() => null)
  const toNext = progress.nextThreshold - progress.xp

  return (
    <div className="rounded-2xl bg-brand-600 text-white p-5 flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Your level</p>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[40px] leading-[0.9]">Level {progress.level}</p>
          <p className="text-xs text-white/80 tabular-nums">{progress.intoLevel.toLocaleString()} / {progress.span.toLocaleString()} XP</p>
        </div>
        <div className="mt-2.5 h-2 rounded-full bg-white/25 overflow-hidden" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level">
          <div className="h-full rounded-full bg-white" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-white/80">{toNext.toLocaleString()} XP to level {progress.level + 1}</p>
      </div>

      {next && (
        <div className="rounded-xl bg-white/15 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">Next achievement</p>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20 text-xl" aria-hidden>{next.achievement.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{next.achievement.name}</p>
              <p className="text-xs text-white/85 truncate">{next.remaining} · +{next.achievement.xp} XP</p>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-white/25 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-white/90" style={{ width: `${next.percent}%` }} />
          </div>
        </div>
      )}

      <Link
        href="/achievements"
        className="mt-1 flex items-center justify-center h-11 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors"
      >
        See all achievements
      </Link>
    </div>
  )
}

export function LevelCardSkeleton() {
  return <div className="h-[290px] rounded-2xl bg-brand-600/80 animate-pulse" />
}
