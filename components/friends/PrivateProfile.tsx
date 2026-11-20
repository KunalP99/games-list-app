import { levelProgress } from '@/lib/achievements'
import { LevelAvatar } from '@/components/profile/ProfileHero'

/**
 * What a profile shows someone its owner keeps it from (Settings → Privacy →
 * Profile set to Friends or Only me): the banner in their colour, with no
 * game picture and none of their figures (completed, hours, rating, tickets),
 * just who they are and their level; then a card saying it's private, with
 * the way to become friends. Nothing else of theirs is loaded.
 *
 * Their accent, never the viewer's (see the note in ProfileHero).
 */
export default function PrivateProfile({
  name,
  username,
  initials,
  accent,
  xp,
  friendButton,
}: {
  name: string
  username: string
  initials: string
  accent: string
  xp: number
  friendButton: React.ReactNode
}) {
  const { level, percent } = levelProgress(xp)

  return (
    <div className="space-y-6">
      <div className="relative rounded-xl border border-edge-base overflow-hidden" style={{ backgroundColor: accent }}>
        {/* The same flat accent gradient the full banner falls back to when it has no picture. */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}44 100%)` }} />
        <div className="relative px-5 sm:px-7 pt-8 pb-6">
          <div className="flex items-end gap-4 flex-wrap">
            <LevelAvatar initials={initials} accent={accent} percent={percent} />
            <div className="min-w-0 pb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight break-words">{name}</h1>
              <p className="text-sm text-white/70 mt-0.5">
                @{username}
                {' · '}Level {level}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-edge-base bg-surface-base px-6 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-fg-secondary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-fg-base">This profile is private</h2>
        <p className="mt-1 text-sm text-fg-muted">Become friends with {name} to see their games, stats and activity.</p>
        {friendButton && <div className="mt-5 flex justify-center">{friendButton}</div>}
      </div>
    </div>
  )
}
