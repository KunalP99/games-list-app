export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero card */}
      <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden">
        <div className="h-36 bg-surface-active rounded-t-xl" />
        <div className="px-6 pb-6">
          <div className="w-24 h-24 rounded-full bg-surface-active -mt-12 mb-3" />
          <div className="h-7 w-40 bg-surface-active rounded-lg mb-2" />
          <div className="h-4 w-24 bg-surface-active rounded mb-4" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-7 w-20 bg-surface-active rounded-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Game grid */}
      <div className="h-10 bg-surface-active rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 bg-surface-active rounded-xl" />
        ))}
      </div>
    </div>
  )
}
