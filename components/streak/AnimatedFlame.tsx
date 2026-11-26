// The streak flame, flickering: its outline changes shape (the tip darts and
// the side tongue licks up) and a brighter core flickers inside it, out of
// step (`flame-shape` / `flame-core` in app/globals.css; still for reduced
// motion, and in Safari, which can't animate a path). Orange is a streak
// burning; blue is the profile card's pilot flame when there's none. Used by
// the profile's Play streak card and the dashboard's streak pill.

export const FLAME_PATH = 'M12 2c.6 3.2 2.6 5 4.4 7 1.6 1.8 2.6 3.8 2.6 6.2A7 7 0 0 1 5 15.2c0-2.3 1-4 2.3-5.4.3 1.6 1.2 2.8 2.4 3.3C9.2 9.4 10.2 5.3 12 2Z'

export default function AnimatedFlame({
  tone = 'orange', className, style,
}: {
  tone?: 'orange' | 'blue'
  className?: string
  style?: React.CSSProperties
}) {
  const orange = tone === 'orange'
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d={FLAME_PATH} className={`animate-flame-shape ${orange ? 'fill-orange-500 dark:fill-orange-400' : 'fill-sky-500 dark:fill-sky-400'}`} />
      {/* The brighter core, low in the flame. Scaled on a group: the
          animation's own transform would replace one on the path. */}
      <g transform="translate(12 22.2) scale(0.5) translate(-12 -22.2)">
        <path d={FLAME_PATH} className={`animate-flame-core ${orange ? 'fill-amber-300 dark:fill-amber-200' : 'fill-sky-200 dark:fill-sky-100'}`} />
      </g>
    </svg>
  )
}
