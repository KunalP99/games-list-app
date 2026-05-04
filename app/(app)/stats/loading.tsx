export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-surface-active rounded-lg" />
        <div className="h-9 w-52 bg-surface-active rounded-lg" />
      </div>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-surface-active rounded-xl h-36" />
      ))}
    </div>
  )
}
