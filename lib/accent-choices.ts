/**
 * The accent colours on offer in the public edition (FEATURES.presetAccents),
 * instead of a free colour picker. Each is a mid-strength shade (Tailwind's
 * 600s): white text on it is readable, and it still stands out on a dark
 * page, so a colour chosen in light mode works in dark mode too, and on
 * someone else's screen whichever theme they use.
 */
export type AccentChoice = { name: string; hex: string }

export const ACCENT_CHOICES: readonly AccentChoice[] = [
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Fuchsia', hex: '#c026d3' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Lime', hex: '#65a30d' },
]

/** What a public-edition account starts with. */
export const DEFAULT_ACCENT_CHOICE = ACCENT_CHOICES[0].hex

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

/** Whether `hex` is one of the choices (any case). */
export function isAccentChoice(hex: unknown): hex is string {
  return typeof hex === 'string' && ACCENT_CHOICES.some(c => c.hex === hex.trim().toLowerCase())
}

/**
 * The choice closest to `hex`, for an account whose colour was picked freely
 * before (it's shown as that choice until they pick one). Anything that
 * isn't a colour gives the default.
 */
export function nearestAccentChoice(hex: string | null | undefined): string {
  const from = hex ? rgb(hex) : null
  if (!from) return DEFAULT_ACCENT_CHOICE
  let best = DEFAULT_ACCENT_CHOICE
  let bestDistance = Infinity
  for (const choice of ACCENT_CHOICES) {
    const [r, g, b] = rgb(choice.hex)!
    // Weighted for how the eye sees differences ("redmean").
    const mean = (from[0] + r) / 2
    const distance = (2 + mean / 256) * (from[0] - r) ** 2 + 4 * (from[1] - g) ** 2 + (2 + (255 - mean) / 256) * (from[2] - b) ** 2
    if (distance < bestDistance) { bestDistance = distance; best = choice.hex }
  }
  return best
}
