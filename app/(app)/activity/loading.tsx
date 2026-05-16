export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-44 bg-surface-active rounded-lg" />
      <div className="space-y-px">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 bg-surface-base border border-edge-base first:rounded-t-xl last:rounded-b-xl">
            <div className="w-7 h-7 rounded-full bg-surface-active shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-surface-active rounded w-3/4" />
              <div className="h-2.5 bg-surface-active rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
