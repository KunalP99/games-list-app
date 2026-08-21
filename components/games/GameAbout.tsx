import type { GameExtras } from '@/lib/rawg'

// The game detail page's "About" card: the description plus (when available from
// IGDB) the involved companies with their roles and a small facts block.
export default function GameAbout({ description, extras }: { description: string | null; extras: GameExtras }) {
  const { companies, gameModes, playerPerspectives, themes, franchise, engines, criticRating, criticRatingCount, userRating, userRatingCount } = extras

  const details: Array<{ label: string; value: string }> = []
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

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4 space-y-4">
      <div>
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">About</p>
        {description
          ? <p className="text-fg-secondary text-sm leading-relaxed whitespace-pre-wrap">{description}</p>
          : <p className="text-fg-subtle text-sm">No description available.</p>}
      </div>

      {companies.length > 0 && (
        <div className="border-t border-edge-subtle pt-3">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">Companies</p>
          <div className="space-y-1">
            {companies.map(c => (
              <div key={c.name} className="flex items-baseline gap-2 text-sm">
                <span className="text-fg-muted text-xs flex-shrink-0 w-24">{c.roles.join(' · ') || 'Involved'}</span>
                <span className="text-fg-secondary min-w-0">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {details.length > 0 && (
        <div className="border-t border-edge-subtle pt-3">
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
    </div>
  )
}
