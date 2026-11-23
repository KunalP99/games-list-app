import Link from 'next/link'
import type { CardGame } from '@/lib/profile-cards'

// The Game shelf card: completed games in a lit glass display case (canvas
// board J2). Box art stands on a glass shelf with a faint reflection below
// and a small plaque with the hours. Always the dark case, in either theme,
// like a cabinet lit from above.

type ShelfGame = CardGame & { completedOn: string | null }

const hoursText = (h: number | null) => (h == null ? null : `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`)
const finished = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : null

export default function GameShelf({ games, chosen }: { games: ShelfGame[]; chosen: boolean }) {
  const columns = `repeat(${Math.max(games.length, 1)}, minmax(0, 132px))`

  return (
    <div
      className="flex h-full flex-col gap-4 rounded-2xl border border-white/10 p-5 text-zinc-100"
      style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,255,255,0.11), transparent 70%), linear-gradient(180deg, #19191c, #0d0d0f)' }}
    >
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Game shelf</h2>
        {games.length > 0 && (
          <span className="text-xs text-zinc-400">
            · {chosen ? `${games.length} ${games.length === 1 ? 'game' : 'games'}` : 'latest completed'}
          </span>
        )}
      </div>

      {games.length === 0 ? (
        <p className="flex min-h-[200px] items-center justify-center text-sm text-zinc-400">Complete a game to put it on the shelf.</p>
      ) : (
        // Sideways scrolling also clips the top: the headroom (pulled back by
        // the negative margin) leaves space for a cover lifted on hover.
        <div className="-mt-3 overflow-x-auto pb-1 pt-3">
          <div className="mx-auto min-w-[560px]" style={{ maxWidth: games.length * 132 + (games.length - 1) * 28 }}>
            {/* The games, standing on the glass shelf (the row's bottom edge). */}
            <div className="relative grid items-end justify-between gap-7 px-1" style={{ gridTemplateColumns: columns }}>
              {games.map(g => (
                <Link
                  key={g.id}
                  href={`/games/${g.id}`}
                  title={[g.title, finished(g.completedOn) && `finished ${finished(g.completedOn)}`].filter(Boolean).join(' · ')}
                  className="group block"
                >
                  {g.cover ? (
                    <img
                      src={g.cover}
                      alt={g.title}
                      className="aspect-[3/4] w-full rounded-md object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_rgba(0,0,0,0.6)] transition-transform duration-200 group-hover:-translate-y-1.5"
                    />
                  ) : (
                    <span className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-zinc-800 p-2 text-center text-xs font-semibold">{g.title}</span>
                  )}
                </Link>
              ))}
            </div>
            <div aria-hidden className="h-[3px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <div aria-hidden className="h-0 shadow-[0_0_40px_18px_rgba(186,230,253,0.05)]" />

            {/* Their reflections in the glass, and a plaque with the hours. */}
            <div className="grid justify-between gap-7 px-1" style={{ gridTemplateColumns: columns }}>
              {games.map(g => (
                <div key={g.id} className="flex flex-col items-center">
                  <div aria-hidden className="h-10 w-full overflow-hidden opacity-25 [mask-image:linear-gradient(180deg,#000,transparent)]">
                    {g.cover && (
                      <img src={g.cover} alt="" className="aspect-[3/4] w-full -scale-y-100 rounded-md object-cover object-bottom" />
                    )}
                  </div>
                  {hoursText(g.hours) && (
                    <span className="mt-1 rounded bg-gradient-to-b from-zinc-300 to-zinc-400 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-900">
                      {hoursText(g.hours)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
