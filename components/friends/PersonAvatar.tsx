/** Initials from a name: letters and digits only, so "Alex (test)" is "AT", not "A(". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z0-9À-ɏ]/g, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?'
}

/** A round initials badge in the person's accent colour. */
export default function PersonAvatar({ name, accentColour, size = 32 }: { name: string; accentColour: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ backgroundColor: accentColour ?? '#7c3aed', width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  )
}
