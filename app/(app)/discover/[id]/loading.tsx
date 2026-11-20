/**
 * The store page's skeleton, shown the moment a game is picked from the
 * dashboard search while its IGDB data loads: the same layout as the page
 * (title, media and thumbnail strip, the facts column, the library bar,
 * DLC and editions, more from the developer) in grey blocks.
 */
export default function Loading() {
  const bar = 'rounded-md bg-surface-active'
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading game">
      <div className={`h-9 w-72 max-w-full ${bar}`} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[999_1_560px] space-y-2.5">
          <div className="aspect-video w-full rounded-2xl bg-surface-active" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-video w-28 shrink-0 rounded-lg bg-surface-active sm:w-32" />
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-[1_1_300px] space-y-4">
          <div className="aspect-[460/215] w-full rounded-xl bg-surface-active" />
          <div className="space-y-2">
            <div className={`h-3.5 w-full ${bar}`} />
            <div className={`h-3.5 w-full ${bar}`} />
            <div className={`h-3.5 w-11/12 ${bar}`} />
            <div className={`h-3.5 w-2/3 ${bar}`} />
          </div>
          <div className="space-y-2">
            <div className={`h-3 w-24 ${bar}`} />
            <div className={`h-4 w-48 ${bar}`} />
            <div className={`h-4 w-44 ${bar}`} />
          </div>
          <div className="space-y-2.5 border-t border-edge-subtle pt-3">
            {[40, 32, 36, 28, 44].map((w, i) => (
              <div key={i} className="flex gap-3.5">
                <div className={`h-4 w-20 ${bar}`} />
                <div className={`h-4 ${bar}`} style={{ width: `${w * 4}px` }} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[96, 72, 60, 64, 80].map((w, i) => <div key={i} className="h-6 rounded-md bg-surface-active" style={{ width: w }} />)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-edge-base bg-surface-base px-5 py-4">
        <div className="min-w-[240px] flex-1 space-y-2">
          <div className={`h-5 w-80 max-w-full ${bar}`} />
          <div className={`h-4 w-64 max-w-full ${bar}`} />
        </div>
        <div className="h-11 w-32 rounded-lg bg-surface-active" />
        <div className="h-11 w-36 rounded-lg bg-surface-active" />
      </div>

      <div className="space-y-3">
        <div className={`h-6 w-44 ${bar}`} />
        <div className="divide-y divide-edge-subtle overflow-hidden rounded-2xl border border-edge-base bg-surface-base">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <div className="h-5 w-14 rounded-full bg-surface-active" />
              <div className={`h-4 w-48 ${bar}`} />
              <div className={`ml-auto h-4 w-10 ${bar}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className={`h-6 w-56 ${bar}`} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="aspect-[3/4] rounded-lg bg-surface-active" />
              <div className={`h-4 w-3/4 ${bar}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
