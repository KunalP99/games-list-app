import { levelProgress } from '@/lib/levels'

// The card at the top of a profile (public edition): who they are, their
// level, and their two headline numbers. Always first, never moved.
//
// Colour: their accent, passed as a value, never `brand-*` (which is the
// signed-in viewer's colour; on someone else's profile it would paint yours
// over theirs). Plain component, no hooks: the page's client part and the
// Games tab's server page both render it.

export type ProfileFigures = { hours: number; games: number; completed: number }

export default function ProfileCard({
  name,
  username,
  initials,
  accent,
  xp,
  bio,
  figures,
  action,
}: {
  name: string
  username: string
  initials: string
  accent: string
  xp: number
  /** The bio line, or its editor while editing. Nothing when there's no bio. */
  bio?: React.ReactNode
  /** Null when the viewer may not see their games. */
  figures: ProfileFigures | null
  /** Edit profile for the owner, the friend button for anyone else. */
  action?: React.ReactNode
}) {
  const progress = levelProgress(xp)

  return (
    <section
      aria-label={name}
      className="overflow-hidden rounded-3xl p-5 sm:p-7 text-white"
      style={{ backgroundColor: accent, backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(0,0,0,0.18))' }}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-6">
          <div
            aria-hidden
            className="flex h-20 w-20 sm:h-28 sm:w-28 shrink-0 -rotate-3 items-center justify-center rounded-[26px] sm:rounded-[32px] bg-white font-display text-3xl sm:text-[44px] leading-none select-none shadow-lg shadow-black/15"
            style={{ color: accent }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight break-words">{name}</h1>
                <p className="text-sm text-white/80">@{username}</p>
              </div>
              {action}
            </div>
            {bio}
            <div className="flex max-w-md items-center gap-3">
              <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">Level {progress.level}</span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-white/25"
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress to level ${progress.level + 1}`}
              >
                <div className="h-full rounded-full bg-white" style={{ width: `${progress.percent}%` }} />
              </div>
              <span className="shrink-0 text-xs text-white/80 tabular-nums">
                {progress.intoLevel.toLocaleString()} / {progress.span.toLocaleString()} XP
              </span>
            </div>
          </div>
        </div>

        {figures && (
          <dl className="grid grid-cols-2 gap-3 md:w-[320px] md:shrink-0">
            <div className="rounded-2xl bg-black/20 p-4">
              <dt className="text-xs text-white/80">Hours played</dt>
              <dd className="mt-1.5 font-display text-4xl leading-[0.9] tabular-nums">{Math.round(figures.hours).toLocaleString()}h</dd>
            </div>
            <div className="rounded-2xl bg-black/20 p-4">
              <dt className="text-xs text-white/80">Games</dt>
              <dd className="mt-1.5 font-display text-4xl leading-[0.9] tabular-nums">{figures.games.toLocaleString()}</dd>
              <dd className="mt-1.5 text-xs text-white/80">{figures.completed.toLocaleString()} completed</dd>
            </div>
          </dl>
        )}
      </div>

    </section>
  )
}
