export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse max-w-4xl">
      {/* Cover + title */}
      <div className="h-64 bg-surface-active rounded-xl" />
      <div className="space-y-2">
        <div className="h-8 w-64 bg-surface-active rounded-lg" />
        <div className="h-4 w-40 bg-surface-active rounded" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-surface-active rounded-xl" />
        ))}
      </div>
      {/* Body */}
      <div className="h-32 bg-surface-active rounded-xl" />
    </div>
  )
}
