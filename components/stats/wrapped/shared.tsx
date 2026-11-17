import type { TicketPart } from '@/lib/stats-wrapped'

/**
 * Each section's colours — the same on the solo and head-to-head views so a
 * section is recognisable in both. `main` is the band (and your side when
 * comparing), `deep` the friend's side on desktop, `light` the friend's bar
 * on a phone.
 */
export const PALETTE = {
  games:   { main: '#3F3F46', onMain: '#FFFFFF', deep: '#09090B', light: '#E4E4E7', onLight: '#18181B' },
  finish:  { main: '#7C3AED', onMain: '#FFFFFF', deep: '#3B0764', light: '#EDE9FE', onLight: '#2E1065' },
  most:    { main: '#DB2777', onMain: '#FFFFFF', deep: '#831843', light: '#FCE7F3', onLight: '#500724' },
  session: { main: '#1D4ED8', onMain: '#FFFFFF', deep: '#172554', light: '#DBEAFE', onLight: '#172554' },
  streak:  { main: '#DC2626', onMain: '#FFFFFF', deep: '#7F1D1D', light: '#FEE2E2', onLight: '#450A0A' },
  tickets: { main: '#FACC15', onMain: '#1C1500', deep: '#854D0E', light: '#FEF9C3', onLight: '#1C1500' },
  perfect: { main: '#0E7490', onMain: '#FFFFFF', deep: '#083344', light: '#CFFAFE', onLight: '#083344' },
  xp:      { main: '#10B981', onMain: '#022C22', deep: '#065F46', light: '#D1FAE5', onLight: '#022C22' },
  hours:   { main: '#FF5722', onMain: '#1A0A05', deep: '#9A3412', light: '#FFEDD5', onLight: '#431407' },
} as const

export type SectionColours = { main: string; onMain: string; deep: string; light: string; onLight: string }

/** Ticket breakdown colours: on the bright gold, and on the deep gold. Penalties are always the red one. */
const ON_GOLD: Record<string, string> = { completions: '#1C1500', perfect: '#713F12', skips: '#A16207', other: '#CA8A04', spin: '#1C1500', reroll: '#713F12', choose: '#A16207', penalty: '#B91C1C' }
const ON_DEEP_GOLD: Record<string, string> = { completions: '#FFFFFF', perfect: '#FDE68A', skips: '#FBBF24', other: '#FEF3C7', spin: '#FFFFFF', reroll: '#FDE68A', choose: '#FBBF24', penalty: '#FCA5A5' }

/** A chunky bar split by where tickets came from or went, with the figures under it. */
export function PartsBar({ parts, onDeep = false, thin = false }: { parts: TicketPart[]; onDeep?: boolean; thin?: boolean }) {
  const total = parts.reduce((s, p) => s + p.amount, 0)
  const colours = onDeep ? ON_DEEP_GOLD : ON_GOLD
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex ${thin ? 'h-2' : 'h-4 md:h-6'} rounded-md overflow-hidden gap-0.5 ${total ? '' : 'bg-black/15'}`}>
        {parts.map(p => (
          <div key={p.key} style={{ width: `${(p.amount / total) * 100}%`, backgroundColor: colours[p.key] }} />
        ))}
      </div>
      {!thin && (
        <p className="text-xs md:text-sm font-bold leading-snug">
          {parts.length === 0 ? 'None yet' : parts.map((p, i) => (
            <span key={p.key} style={p.key === 'penalty' ? { color: onDeep ? '#FECACA' : '#7F1D1D' } : undefined}>
              {i > 0 && ' · '}{p.label} {p.amount}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/** The small spaced-out capitals that label every section. */
export function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`m-0 text-xs md:text-sm font-bold tracking-[0.25em] uppercase ${className}`}>{children}</p>
}

/** A display-font number; `leading-[0.9]` keeps it tight, so whatever sits below needs its own margin (a comma's tail drops below the line). */
export function Big({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`m-0 font-display leading-[0.9] ${className}`}>{children}</p>
}

/** A colour lightened towards white, so a dark accent still reads as text on near-black. */
export function readableOnDark(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  if (lum > 0.45) return hex
  const mix = rgb.map(c => Math.round(c + (255 - c) * 0.45))
  return `#${mix.map(c => c.toString(16).padStart(2, '0')).join('')}`
}

export function hoursLabel(hours: number): string {
  return Math.round(hours).toLocaleString('en-GB')
}
