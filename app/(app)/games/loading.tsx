export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-36 bg-surface-active rounded-lg" />
          <div className="h-4 w-20 bg-surface-active rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-surface-active rounded-lg" />
          <div className="h-9 w-28 bg-surface-active rounded-lg" />
        </div>
      </div>
      <div className="h-10 bg-surface-active rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 bg-surface-active rounded-xl" />
        ))}
      </div>
    </div>
  )
}
