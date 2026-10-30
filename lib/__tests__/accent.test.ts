import { describe, it, expect, beforeEach } from 'vitest'
import { applyAccentPalette, accentPalette } from '@/lib/accent'

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

function getCssVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name).trim()
}

function parseRgb(value: string): [number, number, number] | null {
  const parts = value.split(' ').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return [parts[0], parts[1], parts[2]]
}

// Perceived luminance — used to compare lightness across shades
function luminance([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

describe('applyAccentPalette', () => {
  beforeEach(() => {
    for (const shade of SHADES) {
      document.documentElement.style.removeProperty(`--brand-${shade}`)
    }
  })

  it('does nothing for an invalid hex string', () => {
    applyAccentPalette('not-a-color')
    expect(getCssVar('--brand-600')).toBe('')
  })

  it('does nothing for an empty string', () => {
    applyAccentPalette('')
    expect(getCssVar('--brand-600')).toBe('')
  })

  it('sets all 11 brand shade variables', () => {
    applyAccentPalette('#7c3aed')
    for (const shade of SHADES) {
      expect(getCssVar(`--brand-${shade}`)).not.toBe('')
    }
  })

  it('shade-600 is always the original color RGB', () => {
    // #ff0000 → R=255 G=0 B=0
    applyAccentPalette('#ff0000')
    expect(getCssVar('--brand-600')).toBe('255 0 0')

    // #7c3aed → R=124 G=58 B=237
    applyAccentPalette('#7c3aed')
    expect(getCssVar('--brand-600')).toBe('124 58 237')
  })

  it('accepts hex without a leading #', () => {
    applyAccentPalette('ff0000')
    expect(getCssVar('--brand-600')).toBe('255 0 0')
  })

  it('shade-50 is lighter than shade-950', () => {
    applyAccentPalette('#e84410')
    const light = parseRgb(getCssVar('--brand-50'))!
    const dark = parseRgb(getCssVar('--brand-950'))!
    expect(luminance(light)).toBeGreaterThan(luminance(dark))
  })

  it('palette overall trend goes from bright to dark (50 → 950)', () => {
    applyAccentPalette('#7c3aed')
    const luminances = SHADES.map(s => {
      const rgb = parseRgb(getCssVar(`--brand-${s}`))!
      return luminance(rgb)
    })
    expect(luminances[0]).toBeGreaterThan(luminances[luminances.length - 1])
  })

  it('all RGB components are valid integers in [0, 255]', () => {
    applyAccentPalette('#3b82f6')
    for (const shade of SHADES) {
      const rgb = parseRgb(getCssVar(`--brand-${shade}`))
      expect(rgb).not.toBeNull()
      for (const channel of rgb!) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
        expect(Number.isInteger(channel)).toBe(true)
      }
    }
  })
})

// ─── accentPalette (pure) ────────────────────────────────────────────────────
// Split out of applyAccentPalette so the desktop app can use the same shades
// without a second copy of the maths. These tests pin that the two halves stay
// in agreement.

describe('accentPalette', () => {
  it('returns all 11 shades in order', () => {
    const palette = accentPalette('#0087db')
    expect(palette).not.toBeNull()
    expect(palette!.map(([stop]) => stop)).toEqual(SHADES)
  })

  it('returns null for anything that is not a hex colour', () => {
    expect(accentPalette('nonsense')).toBeNull()
    expect(accentPalette('')).toBeNull()
    expect(accentPalette('#12345')).toBeNull()
  })

  it('keeps shade-600 as the exact colour the user chose', () => {
    const palette = accentPalette('#e84410')!
    const six = palette.find(([stop]) => stop === '600')!
    expect(six[1]).toEqual([232, 68, 16])
  })

  it('agrees exactly with what applyAccentPalette writes to the DOM', () => {
    // If these ever diverge, the app and the site would show different colours.
    applyAccentPalette('#689df3')
    for (const [stop, [r, g, b]] of accentPalette('#689df3')!) {
      expect(getCssVar(`--brand-${stop}`)).toBe(`${r} ${g} ${b}`)
    }
  })
})
