import { levelTier, tierRange } from '@/lib/level-tiers'
import { FEATURES } from '@/lib/edition'

// A frame round a person's avatar in their level's tier (lib/level-tiers.ts),
// matching LevelBadge: slate, bronze, silver, gold, a turning green emerald
// gradient with a point of light running round it and a soft glow, turning holo foil, burning inferno, and a royal mythic ring (crimson, purple, gold). The looks are CSS in app/globals.css (`.tier-frame--<tier>`),
// still for reduced motion. `children` is the round avatar itself.
export default function TierFrame({
  level,
  width = 3,
  children,
}: {
  level: number
  /** The ring's thickness in px: 3 for a banner-sized avatar, 2 for small ones. */
  width?: number
  children: React.ReactNode
}) {
  // An edition without level tiers (FEATURES.levelTiers) shows the plain avatar.
  if (!FEATURES.levelTiers) return <>{children}</>
  const tier = levelTier(level)
  return (
    <span
      className={`tier-frame tier-frame--${tier.id}`}
      style={{ ['--tier-frame-width' as string]: `${width}px` }}
      title={`Level ${level} · ${tier.name} (${tierRange(tier).toLowerCase()})`}
    >
      {children}
    </span>
  )
}
