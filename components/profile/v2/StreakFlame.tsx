import { streakFlame } from '@/lib/profile-cards'

// The Play streak card: a flame with the streak inside it, bigger and glowing
// brighter the longer the streak runs (streakFlame); a small blue one at none. A square
// is just the flame; a half card puts the days and the best beside it.

const FLAME = 'M12 2c.6 3.2 2.6 5 4.4 7 1.6 1.8 2.6 3.8 2.6 6.2A7 7 0 0 1 5 15.2c0-2.3 1-4 2.3-5.4.3 1.6 1.2 2.8 2.4 3.3C9.2 9.4 10.2 5.3 12 2Z'

const days = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'day' : 'days'}`

function Flame({ current }: { current: number }) {
  const { size, glow } = streakFlame(current)
  const lit = size > 0
  const digits = String(current).length
  return (
    // Sized by its height, like the finish rate's ring; the number scales with it.
    <div className="relative aspect-square h-full max-w-full" style={{ containerType: 'inline-size' }}>
      <div
        className="absolute inset-0 origin-bottom"
        // No streak: a small blue pilot flame, waiting to be lit, with no number.
        style={{ transform: `scale(${lit ? size : 0.45})` }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-full w-full"
          aria-hidden
          style={{
            filter: lit
              ? `drop-shadow(0 0 ${4 + glow * 10}cqw rgba(249,115,22,${0.25 + glow * 0.45}))`
              : 'drop-shadow(0 0 6cqw rgba(56,189,248,0.35))',
          }}
        >
          <path d={FLAME} className={lit ? 'fill-orange-500 dark:fill-orange-400' : 'fill-sky-500 dark:fill-sky-400'} />
        </svg>
        {lit && (
          <span
            className="absolute inset-x-0 top-[57%] text-center font-display leading-none tabular-nums text-orange-950"
            style={{ fontSize: digits >= 3 ? '20cqw' : '30cqw' }}
          >
            {current}
          </span>
        )}
      </div>
    </div>
  )
}

export default function StreakFlame({
  label, current, best, square,
}: {
  label: string
  current: number
  best: number
  square: boolean
}) {
  // The streak running now is the best one (streaks look back a year).
  const record = current > 0 && current >= best
  const summary = `${days(current)} in a row${record ? ', your best yet' : best > 0 ? `, best ${days(best)}` : ''}`
  const note = current > 0
    ? `days in a row · ${record ? 'your best yet' : `best ${best}`}`
    : best > 0 ? `No streak right now · best ${best}` : 'No tracked play yet'
  return (
    <div
      className={`relative isolate flex h-full flex-col overflow-hidden rounded-2xl border border-transparent bg-orange-100 text-orange-950 dark:bg-orange-400/15 dark:text-orange-100 ${square ? 'p-4' : 'min-h-[150px] p-5'}`}
      role="group"
      aria-label={`${label}: ${summary}`}
    >
      <h2 className="text-sm font-medium opacity-80">{label}</h2>
      {square ? (
        <>
          <div className="absolute inset-x-6 bottom-10 top-9 -z-10 flex items-end justify-center"><Flame current={current} /></div>
          <span className="flex-1" />
          <p data-note className="text-center text-xs opacity-75">{note}</p>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center gap-5">
          <div className="flex h-full max-h-40 min-h-[110px] w-2/5 items-end justify-center"><Flame current={current} /></div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-display text-5xl leading-[0.9] tabular-nums">{days(current)}</p>
            <p className="text-sm opacity-75">{current > 0 ? 'in a row, and counting' : 'Play today to start one'}</p>
            {best > 0 && (
              <span className="mt-1 self-start rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium dark:bg-orange-400/20">
                {record ? 'Your best yet' : `Best ${days(best)}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
