// Mirrors the dashboard's layout (components/dashboard/new/NewDashboard.tsx):
// header, then the main column (hero, four stats, activity) beside the rail.
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-40 bg-surface-active rounded" />
        <div className="h-8 w-64 bg-surface-active rounded-lg" />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex-[999_1_640px] min-w-0 space-y-4">
          <div className="h-[300px] bg-surface-active rounded-2xl" />
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-surface-active rounded-xl" />
            ))}
          </div>
          <div className="h-96 bg-surface-active rounded-2xl" />
        </div>
        <div className="flex-[1_1_300px] min-w-0 space-y-4">
          <div className="h-44 bg-surface-active rounded-2xl" />
          <div className="h-56 bg-surface-active rounded-2xl" />
          <div className="h-72 bg-surface-active rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
