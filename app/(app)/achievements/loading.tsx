export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-surface-active rounded-lg" />
      <div className="h-10 bg-surface-active rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface-active rounded-xl" />
        ))}
      </div>
    </div>
  )
}
