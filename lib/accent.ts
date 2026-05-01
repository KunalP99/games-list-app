function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const ch = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255)]
}

// Sets --brand-50 through --brand-950 on :root so all brand-* Tailwind classes update.
export function applyAccentPalette(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return
  const [h, s, l] = rgbToHsl(...rgb)
  const sat = Math.max(s, 0.55)

  const shades: [string, [number, number, number]][] = [
    ['50',  hslToRgb(h, Math.min(sat * 0.55, 1), 0.97)],
    ['100', hslToRgb(h, Math.min(sat * 0.65, 1), 0.94)],
    ['200', hslToRgb(h, Math.min(sat * 0.78, 1), 0.88)],
    ['300', hslToRgb(h, sat, 0.78)],
    ['400', hslToRgb(h, sat, 0.67)],
    ['500', hslToRgb(h, sat, Math.min(l + 0.06, 0.90))],
    ['600', rgb],
    ['700', hslToRgb(h, sat, Math.max(l - 0.08, 0.15))],
    ['800', hslToRgb(h, sat, Math.max(l - 0.18, 0.10))],
    ['900', hslToRgb(h, sat, Math.max(l - 0.28, 0.06))],
    ['950', hslToRgb(h, sat, Math.max(l - 0.36, 0.04))],
  ]

  const root = document.documentElement
  for (const [shade, [r, g, b]] of shades) {
    root.style.setProperty(`--brand-${shade}`, `${r} ${g} ${b}`)
  }
}
