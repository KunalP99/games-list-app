// The Wrapped page's shape while it loads: the picker, then a stack of tall
// bands.
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-11 w-52 bg-surface-active rounded-full" />
      <div className="rounded-3xl overflow-hidden space-y-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-surface-active h-64 md:h-80" />
        ))}
      </div>
    </div>
  )
}
