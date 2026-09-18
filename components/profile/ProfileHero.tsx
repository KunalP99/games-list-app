import { levelProgress } from '@/lib/achievements'
import type { UserStats } from '@/lib/user-stats'

// NOTE ON COLOUR: everything accented here uses `accent` inline, never a
// `brand-*` class. `brand-*` resolves from the --brand-* CSS vars that
// lib/accent.ts writes for the *logged-in viewer* — on someone else's profile
// that would paint your colour over their identity.

function StatFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <span className="text-xl font-bold text-white tabular-nums">{value}</span>
      <span className="text-xs text-white/65 ml-1.5">{label}</span>
    </div>
  )
}

// Tickets get two numbers instead of one: the lifetime total (the headline
// figure, same size as every other stat) and their current spendable balance
// right beside it, smaller — since they've usually spent some of what they've
// earned, and both numbers tell a different part of the story.
function TicketFigure({ total, current }: { total: number; current: number }) {
  return (
    <div>
      <span className="text-xl font-bold text-white tabular-nums" title="Total tickets earned">
        🎟️ {total.toLocaleString()}
      </span>
      <span className="text-sm font-semibold text-white/70 tabular-nums ml-1.5" title="Current balance">
        {current.toLocaleString()}
      </span>
      <span className="text-xs text-white/65 ml-1.5">tickets</span>
    </div>
  )
}

/** Avatar with an XP level ring around it. */
export function LevelAvatar({
  initials,
  accent,
  percent,
  size = 'w-24 h-24',
  text = 'text-3xl',
}: {
  initials: string
  accent: string
  percent: number
  size?: string
  text?: string
}) {
  return (
    <div
      className="shrink-0 rounded-full p-[3px]"
      style={{ background: `conic-gradient(${accent} ${percent}%, rgba(255,255,255,0.25) 0)` }}
    >
      <div
        className={`${size} ${text} rounded-full flex items-center justify-center font-bold text-white select-none border-[3px] border-surface-base`}
        style={{ backgroundColor: accent }}
      >
        {initials}
      </div>
    </div>
  )
}

export default function ProfileHero({
  stats,
  bannerImage,
  initials,
  accent,
  wheelTurn,
}: {
  stats: UserStats
  /** Resolved by the page (lib/hero-banner.ts) — a live screenshot of this
   *  week's hero game when one could be fetched, else its stored artwork. */
  bannerImage: string | null
  initials: string
  accent: string
  wheelTurn: string | null
}) {
  const { profile } = stats
  const { level, percent } = levelProgress(profile.xp ?? 0)

  const figures: [string, string][] = [
    [stats.completedCount.toLocaleString(), 'completed'],
    [`${Math.round(stats.totalHours).toLocaleString()}h`, 'played'],
    ...(stats.avgRating != null ? [[String(stats.avgRating), 'avg rating'] as [string, string]] : []),
    ...(stats.perfectedCount > 0 ? [[String(stats.perfectedCount), 'at 100%'] as [string, string]] : []),
  ]

  return (
    <div className="relative rounded-xl border border-edge-base overflow-hidden">
      {/* Backdrop: a live screenshot of this week's pick from their 5-star
          games where one could be found (screenshots, unlike key art or box
          art, don't usually carry a baked-in title/logo) — otherwise their
          stored artwork. Blurred to texture either way. Falls back to the
          flat accent gradient when there's nothing to show at all. */}
      {bannerImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerImage}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm"
          />
          {/* Near-opaque accent behind the name and figures, thinning across the
              card so the artwork still reads as texture on the right. */}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(115deg, ${accent}f2 0%, ${accent}b3 45%, rgba(0,0,0,0.55) 100%)` }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}44 100%)` }}
        />
      )}

      <div className="relative px-5 sm:px-7 pt-8 pb-5">
        <div className="flex items-end gap-4 flex-wrap">
          <LevelAvatar initials={initials} accent={accent} percent={percent} />

          <div className="min-w-0 pb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              {profile.display_name ?? profile.username}
            </h1>
            <p className="text-sm text-white/70 mt-0.5">
              @{profile.username}
              {' · '}Level {level}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
          {figures.map(([value, label]) => (
            <StatFigure key={label} value={value} label={label} />
          ))}
          <TicketFigure total={stats.ticketsEarned} current={profile.ticket_balance} />
        </div>

        {stats.heroGame && bannerImage && (
          // pr- reserve keeps this from running under the pill, which floats
          // independently at the bottom-right corner.
          <p className="mt-3 pr-28 text-[11px] text-white/45">
            This week&rsquo;s banner: {stats.heroGame.title}
          </p>
        )}

        {/* Bottom-right of the hero, not the identity row — so it doesn't
            compete with the name/handle for the top-right corner. */}
        {wheelTurn && (
          <div className="absolute bottom-5 right-5 sm:right-7">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-black/35 text-white border border-white/25 backdrop-blur-sm">
              🎡 {wheelTurn === 'spin' ? 'Spin turn' : wheelTurn === 'spin_reroll' ? 'Spin + Reroll turn' : 'Choose turn'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
