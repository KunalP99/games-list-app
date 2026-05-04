export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 bg-surface-active rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface-active rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-48 bg-surface-active rounded-xl" />
        <div className="h-48 bg-surface-active rounded-xl" />
      </div>
      <div className="h-64 bg-surface-active rounded-xl" />
    </div>
  )
}
