/**
 * Which icon a platform gets (the Platforms card). Platforms are free text
 * from the platform picker (components/games/PlatformSelect.tsx), so this
 * matches on the name. Brand icons come from Simple Icons
 * (lib/platform-brand-paths.ts); Nintendo and Microsoft have none there, so
 * their platforms get a drawn device icon instead (PlatformIcon).
 */
import type { BrandIcon } from './platform-brand-paths'

export type DrawnIcon = 'switch' | 'handheld' | 'dual' | 'remote' | 'cube' | 'gamepad' | 'windows' | 'globe' | 'phone' | 'cloud'
export type PlatformIconKey = { brand: BrandIcon } | { drawn: DrawnIcon }

const brand = (b: BrandIcon): PlatformIconKey => ({ brand: b })
const drawn = (d: DrawnIcon): PlatformIconKey => ({ drawn: d })

/** First match wins, so the specific names come before the families. */
const RULES: [RegExp, PlatformIconKey][] = [
  [/^steam\b/, brand('steam')],
  [/^epic/, brand('epic')],
  [/^ea\b/, brand('ea')],
  [/^gog/, brand('gog')],
  [/^ubisoft/, brand('ubisoft')],
  [/^battle\.?net/, brand('battlenet')],
  [/^itch/, brand('itch')],
  [/^rockstar/, brand('rockstar')],
  // Every PlayStation gets the PlayStation symbol: the PS2–PS5, PSP and Vita
  // icons are wide wordmarks, unreadable at icon size. The name says which.
  [/^playstation now/, drawn('cloud')],
  [/^(ps ?\d|ps ?vita|psp|ps one|playstation)/, brand('playstation')],
  [/^(pc|microsoft store|game pass \(pc\)|xbox app \(pc\)|windows)/, drawn('windows')],
  [/^xbox/, drawn('gamepad')],
  [/^(mac|macos)\b/, brand('apple')],
  [/^linux/, brand('linux')],
  [/^browser|^web/, drawn('globe')],
  [/^amazon luna|^playstation now|^cloud/, drawn('cloud')],
  [/^nintendo switch|^switch/, drawn('switch')],
  [/^(new )?nintendo (3ds|dsi?|ds)\b|^(3ds|ds)\b/, drawn('dual')],
  [/^game ?boy|^virtual boy|^game gear|^atari lynx|^neo geo pocket/, drawn('handheld')],
  [/^wii/, drawn('remote')],
  [/^gamecube/, drawn('cube')],
  [/^sega|^dreamcast/, brand('sega')],
  [/^atari/, brand('atari')],
  [/^mobile \(ios\)$|^ios/, brand('apple')],
  [/^mobile \(android\)$|^android/, brand('android')],
  [/^mobile/, drawn('phone')],
  [/^commodore|^amiga/, brand('commodore')],
]

export function platformIcon(platform: string): PlatformIconKey {
  const name = platform.trim().toLowerCase()
  for (const [pattern, icon] of RULES) if (pattern.test(name)) return icon
  return drawn('gamepad')
}
