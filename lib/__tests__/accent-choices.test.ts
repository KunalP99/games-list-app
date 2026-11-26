import { describe, it, expect } from 'vitest'
import { ACCENT_CHOICES, DEFAULT_ACCENT_CHOICE, isAccentChoice, nearestAccentChoice } from '../accent-choices'

// Relative luminance (WCAG), to check each choice works in both themes.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('accent choices', () => {
  it('are distinct lowercase colours with names', () => {
    expect(new Set(ACCENT_CHOICES.map(c => c.hex)).size).toBe(ACCENT_CHOICES.length)
    for (const c of ACCENT_CHOICES) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('each carries white text and stands out on a dark page', () => {
    for (const c of ACCENT_CHOICES) {
      expect(contrast(c.hex, '#ffffff'), `${c.name} behind white text`).toBeGreaterThanOrEqual(3)
      expect(contrast(c.hex, '#121214'), `${c.name} on a dark page`).toBeGreaterThanOrEqual(3)
    }
  })

  it('recognises a choice in any case, and nothing else', () => {
    expect(isAccentChoice('#EA580C')).toBe(true)
    expect(isAccentChoice('#ff5722')).toBe(false)
    expect(isAccentChoice(null)).toBe(false)
  })

  it('maps a freely picked colour to the closest choice', () => {
    expect(nearestAccentChoice('#ff5722')).toBe('#ea580c')
    expect(nearestAccentChoice('#7c3aed')).toBe('#7c3aed')
    expect(nearestAccentChoice('#00ff00')).toBe('#16a34a')
    expect(nearestAccentChoice('#3b82f6')).toBe('#2563eb')
    expect(nearestAccentChoice(null)).toBe(DEFAULT_ACCENT_CHOICE)
    expect(nearestAccentChoice('not a colour')).toBe(DEFAULT_ACCENT_CHOICE)
  })
})
