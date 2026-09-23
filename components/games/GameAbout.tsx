import type { ReactNode } from 'react'
import type { GameExtras } from '@/lib/rawg'
import type { SteamReviewBadge } from '@/lib/steam'

// Steam's own three buckets. Kept subtle — this sits in a list of plain facts,
// so it reads as a coloured verdict rather than a call to action.
const STEAM_TONE: Record<SteamReviewBadge['tone'], string> = {
  positive: 'text-sky-600 dark:text-sky-400',
  mixed: 'text-amber-600 dark:text-amber-400',
  negative: 'text-red-600 dark:text-red-400',
}

// The game detail page's "About" card: the description plus (when available from
// IGDB) the involved companies with their roles and a small facts block.
export default function GameAbout({ description, extras, steamReview = null }: { description: string | null; extras: GameExtras; steamReview?: SteamReviewBadge | null }) {
  const { companies, gameModes, playerPerspectives, themes, franchise, engines, criticRating, criticRatingCount, userRating, userRatingCount } = extras

  const details: Array<{ label: string; value: ReactNode }> = []
  if (gameModes.length) details.push({ label: 'Modes', value: gameModes.join(', ') })
  if (playerPerspectives.length) details.push({ label: 'Perspective', value: playerPerspectives.join(', ') })
  if (themes.length) details.push({ label: 'Themes', value: themes.join(', ') })
  if (franchise) details.push({ label: 'Franchise', value: franchise })
  if (engines.length) details.push({ label: 'Engine', value: engines.join(', ') })
  if (criticRating != null) {
    details.push({ label: 'Critic score', value: `${criticRating}%${criticRatingCount ? ` · ${criticRatingCount} reviews` : ''}` })
  }
  if (userRating != null) {
    details.push({ label: 'User score', value: `${userRating}%${userRatingCount ? ` · ${userRatingCount.toLocaleString()} users` : ''}` })
  }
  if (steamReview) {
    details.push({
      label: 'Steam reviews',
      value: (
        <>
          <span className={`font-medium ${STEAM_TONE[steamReview.tone]}`}>{steamReview.label}</span>
          <span className="text-fg-muted"> · {steamReview.percent}% of {steamReview.totalReviews.toLocaleString()}</span>
        </>
      ),
    })
  }

  // Group companies by role → one row per role, names comma-joined (so two
  // publishers show as a single "Publisher: A, B" line).
  const companyRows: Array<{ role: string; names: string }> = []
  const roleIndex = new Map<string, number>()
  for (const c of companies) {
    const role = c.roles[0] ?? 'Involved'
    const idx = roleIndex.get(role)
    if (idx == null) {
      roleIndex.set(role, companyRows.length)
      companyRows.push({ role, names: c.name })
    } else {
      companyRows[idx].names += `, ${c.name}`
    }
  }

  const hasCompanies = companyRows.length > 0
  const hasDetails = details.length > 0

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4 space-y-4">
      {hasCompanies && (
        <div>
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">Companies</p>
          <div className="space-y-1">
            {companyRows.map(r => (
              <div key={r.role} className="flex items-baseline gap-2 text-sm">
                <span className="text-fg-muted text-xs flex-shrink-0 w-24">{r.role}</span>
                <span className="text-fg-secondary min-w-0">{r.names}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasDetails && (
        <div className={hasCompanies ? 'border-t border-edge-subtle pt-3' : ''}>
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2.5">Details</p>
          <dl className="space-y-1">
            {details.map(d => (
              <div key={d.label} className="flex items-baseline gap-2 text-sm">
                <dt className="text-fg-muted text-xs flex-shrink-0 w-24">{d.label}</dt>
                <dd className="text-fg-secondary min-w-0">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className={hasCompanies || hasDetails ? 'border-t border-edge-subtle pt-3' : ''}>
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">About</p>
        {description
          ? <p className="text-fg-secondary text-sm leading-relaxed whitespace-pre-wrap">{description}</p>
          : <p className="text-fg-subtle text-sm">No description available.</p>}
      </div>
    </div>
  )
}
