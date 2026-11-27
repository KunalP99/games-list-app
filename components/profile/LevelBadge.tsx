import { levelTier, tierRange } from '@/lib/level-tiers'

// "LEVEL 7" as a badge that gets fancier with the tier (lib/level-tiers.ts):
// slate, bronze, silver, gold (with a shine), emerald (a cut gem with
// sparkles), diamond (deep navy with a crystal edge running round it), inferno (a fire-lit edge and
// embers) and mythic (a spinning royal edge (crimson, purple, gold), stars and a crown). The looks
// are CSS in app/globals.css (`.level-badge--<tier>`); every animation there
// stops for reduced motion. Sized by font-size, so `className` can scale it.
export default function LevelBadge({ level, className = '' }: { level: number; className?: string }) {
  const tier = levelTier(level)
  return (
    <span
      className={`level-badge level-badge--${tier.id} ${className}`}
      title={`${tier.name} · ${tierRange(tier)}`}
    >
      {tier.id === 'emerald' && (
        <>
          <i aria-hidden className="level-badge__spark" style={{ left: '18%', top: '15%' }} />
          <i aria-hidden className="level-badge__spark" style={{ right: '22%', bottom: '18%', animationDelay: '1.1s' }} />
        </>
      )}
      {tier.id === 'inferno' &&
        [[15, 0], [40, 0.7], [68, 1.3], [88, 0.4]].map(([x, d]) => (
          <i aria-hidden key={x} className="level-badge__ember" style={{ left: `${x}%`, animationDelay: `${d}s` }} />
        ))}
      {tier.id === 'mythic' && <span aria-hidden className="level-badge__crown">♛</span>}
      <span className="level-badge__text">
        LEVEL <b>{level}</b>
      </span>
    </span>
  )
}
