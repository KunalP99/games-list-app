import { shortGenre, type GenreColumn } from '@/lib/profile-cards'

// The Favourite genres card: a block per genre, its area following how many
// games have it (genreColumns), in your colour, each one a step darker. White
// text stays readable on all of them: the accent choices are tested against
// white, and darkening only adds contrast.

const DARKEN = [0, 18, 32, 44]
const NUMBER_SIZE = ['text-4xl', 'text-3xl', 'text-xl', 'text-xl']

export default function GenreBlocks({ columns, accent }: { columns: GenreColumn[]; accent: string }) {
  let index = 0
  const blocks = columns.map(col => col.blocks.map(b => ({ ...b, index: index++ })))
  return (
    <ul className="flex min-h-[170px] flex-1 gap-1" aria-label="Favourite genres, by number of games">
      {columns.map((col, c) => (
        <li key={c} className="flex min-w-0 flex-col gap-1" style={{ flex: `${col.weight} 1 0` }}>
          <ul className="contents">
            {blocks[c].map(b => {
              const stacked = col.blocks.length > 1
              return (
                <li
                  key={b.name}
                  className={`flex min-h-0 min-w-0 rounded-xl p-2.5 text-white ${stacked ? 'items-end justify-between gap-2' : 'flex-col justify-between'}`}
                  style={{ flex: `${b.weight} 1 0`, backgroundColor: `color-mix(in srgb, ${accent}, black ${DARKEN[b.index] ?? 44}%)` }}
                  title={`${b.name}: ${b.count} ${b.count === 1 ? 'game' : 'games'}`}
                >
                  <span className={`line-clamp-2 break-words font-bold leading-tight ${b.index < 2 ? 'text-sm' : 'text-xs'}`}>{shortGenre(b.name)}</span>
                  <span className={`font-display leading-[0.9] tabular-nums ${NUMBER_SIZE[b.index] ?? 'text-xl'}`}>
                    {b.count}<span className="sr-only"> {b.count === 1 ? 'game' : 'games'}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}
