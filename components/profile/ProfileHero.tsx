import { levelProgress } from '@/lib/achievements'
import type { UserStats } from '@/lib/user-stats'
import { FEATURES } from '@/lib/edition'
import ClassicHero from '@/components/profile/ClassicHero'
import LevelBadge from '@/components/profile/LevelBadge'
import TierFrame from '@/components/profile/TierFrame'
import { levelTier } from '@/lib/level-tiers'
import AnimatedFlame from '@/components/streak/AnimatedFlame'

// NOTE ON COLOUR: everything accented here uses `accent` inline, never a
// `brand-*` class. `brand-*` resolves from the --brand-* CSS vars that
// lib/accent.ts writes for the *logged-in viewer* — on someone else's profile
// that would paint your colour over their identity.

// A big figure with its label underneath (the Cinematic banner's numbers).
function StatFigure({ value, label, ticket, children }: { value: string; label: string; ticket?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <div className="font-display text-3xl sm:text-[40px] leading-[0.9] text-white tabular-nums drop-shadow">
        {/* The nav pill's ticket: an emoji here sat above the line in this font. */}
        {ticket && <span aria-hidden className="inline-block w-4 h-[11px] rounded-[3px] bg-rose-500 mr-2 relative -top-[0.3em]" />}
        {value}
        {children}
      </div>
      <div className="text-xs text-white/65 mt-2">{label}</div>
    </div>
  )
}

// Tickets get two numbers instead of one: the lifetime total leads at full
// size, their current spendable balance follows in parentheses at a smaller
// size, then "tickets" labels the whole figure — "120 (214) tickets".
// The public edition shows one number, the tickets you have now — the same
// figure as the nav's ticket pill (lib/edition.ts).
function TicketFigure({ total, current }: { total: number; current: number }) {
  const lead = FEATURES.ticketBalanceInBanner ? total : current
  return (
    <StatFigure value={lead.toLocaleString()} label="tickets" ticket>
      {FEATURES.ticketBalanceInBanner && (
        <span className="text-[18px] sm:text-[20px] leading-none text-white/70 ml-1.5" title="Current balance">
          ({current.toLocaleString()})
        </span>
      )}
    </StatFigure>
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
  showTickets = true,
  streak = 0,
}: {
  stats: UserStats
  /** Resolved by the page (lib/hero-banner.ts) — a live screenshot of this
   *  week's hero game when one could be fetched, else its stored artwork. */
  bannerImage: string | null
  initials: string
  accent: string
  wheelTurn: string | null
  /** False when the viewer may not see their tickets (public edition, Settings → Privacy). */
  showTickets?: boolean
  /** Their current play streak in days (lib/data/current-streak.ts); 0 hides the flame. */
  streak?: number
}) {
  if (!FEATURES.cinematicBanner) {
    return <ClassicHero stats={stats} bannerImage={bannerImage} initials={initials} accent={accent} wheelTurn={wheelTurn} showTickets={showTickets} />
  }
  const { profile } = stats
  const { level, percent, intoLevel, span, xp, nextThreshold } = levelProgress(profile.xp ?? 0)

  const figures: [string, string][] = [
    [stats.completedCount.toLocaleString(), 'completed'],
    [`${Math.round(stats.totalHours).toLocaleString()}h`, 'played'],
    ...(stats.avgRating != null ? [[String(stats.avgRating), 'avg rating'] as [string, string]] : []),
    ...(stats.perfectedCount > 0 ? [[String(stats.perfectedCount), 'at 100%'] as [string, string]] : []),
  ]

  const name = profile.display_name ?? profile.username
  const hero = stats.heroGame

  return (
    // "Cinematic": this week's banner game sharp and full width, drifting
    // slowly like a film still, dark on the left and along the bottom so the
    // name and figures read over it. The accent fills the card from the first
    // paint (so it looks finished while the image downloads) and runs along
    // the bottom edge as a line.
    <div
      className="relative rounded-xl border border-edge-base overflow-hidden"
      style={{ backgroundColor: accent }}
    >
      {/* Backdrop: a live screenshot of this week's pick from their 5-star
          games where one could be found (screenshots, unlike key art or box
          art, don't usually carry a baked-in title/logo) — otherwise their
          stored artwork. Falls back to a dark accent gradient when there's
          nothing to show at all. */}
      {bannerImage ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={bannerImage}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover scale-[1.04] animate-banner-drift"
            />
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 75%), ' +
                'linear-gradient(0deg, rgba(0,0,0,0.85), transparent 55%)',
            }}
          />
          {/* On phones the figures run the full width, into the art's lighter
              right side, so darken it all a little more there. */}
          <div className="absolute inset-0 bg-black/40 sm:hidden" />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, #000 100%)` }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ backgroundColor: accent }} />

      <div className="relative flex flex-col justify-between gap-6 min-h-[300px] sm:min-h-[380px] px-5 sm:px-10 pt-6 sm:pt-8 pb-6 sm:pb-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Framed in the level's tier, like the badge beside it. */}
            <TierFrame level={level}>
              <span
                className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white select-none border-2 border-black/70"
                style={{ backgroundColor: accent }}
              >
                {initials}
              </span>
            </TierFrame>
            <div className="min-w-0">
              {/* One line on wider screens, two on phones (beside the wheel pill). */}
              <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
                <span className="text-sm text-white/80 truncate max-w-full">@{profile.username}</span>
                <LevelBadge level={level} />
              </div>
              {/* Progress to the next level, in the tier's colours. */}
              <div
                role="progressbar"
                aria-label={`Level ${level} progress`}
                aria-valuemin={0}
                aria-valuemax={span}
                aria-valuenow={intoLevel}
                title={`${intoLevel.toLocaleString()} / ${span.toLocaleString()} XP · ${(span - intoLevel).toLocaleString()} XP to level ${level + 1}`}
                className="mt-2 h-1.5 w-40 sm:w-56 rounded-full bg-white/20 overflow-hidden"
              >
                <div className={`level-bar level-bar--${levelTier(level).id} h-full rounded-full`} style={{ width: `${percent}%` }} />
              </div>
              {/* Their XP and the XP the next level starts at: "2,450 / 2,800 XP". */}
              <p className="mt-1.5 text-[11px] text-white/65 tabular-nums">
                <span className="font-semibold text-white/90">{xp.toLocaleString()}</span> / {nextThreshold.toLocaleString()} XP
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {/* The play streak: just the flickering flame and the number. */}
            {streak > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={`${streak} day play streak`}
                aria-label={`${streak} day play streak`}
              >
                <AnimatedFlame className="h-6 w-6 sm:h-8 sm:w-8" style={{ filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.6))' }} />
                <span className="font-display text-2xl sm:text-[32px] leading-none text-white tabular-nums drop-shadow">{streak}</span>
              </span>
            )}
            {wheelTurn && (
              <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-black/40 text-white border border-white/25 backdrop-blur-sm">
                🎡 {wheelTurn === 'spin' ? 'Spin turn' : wheelTurn === 'spin_reroll' ? 'Spin + Reroll turn' : 'Choose turn'}
              </span>
            )}
          </div>
        </div>

        <h1 className="font-display uppercase text-white text-[clamp(3rem,9vw,6.5rem)] leading-[0.9] tracking-tight break-words line-clamp-2 drop-shadow-lg">
          {name}
        </h1>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div className="flex flex-wrap gap-x-8 sm:gap-x-10 gap-y-4">
            {figures.map(([value, label]) => (
              <StatFigure key={label} value={value} label={label} />
            ))}
            {showTickets && <TicketFigure total={stats.ticketsEarned} current={profile.ticket_balance} />}
          </div>

          {hero && bannerImage && (
            <p className="text-xs text-white/60 drop-shadow">
              This week&rsquo;s banner: <span className="font-semibold text-white/90">{hero.title}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
