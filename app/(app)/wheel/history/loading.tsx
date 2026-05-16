export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1">
        <div className="h-8 w-44 bg-surface-active rounded-lg" />
        <div className="h-4 w-32 bg-surface-active rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 bg-surface-active rounded-xl" />
        ))}
      </div>
    </div>
  )
}
