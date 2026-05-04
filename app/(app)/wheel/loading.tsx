export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-pulse">
      <div className="space-y-4 text-center w-full max-w-md">
        <div className="h-8 w-40 bg-surface-active rounded-lg mx-auto" />
        <div className="h-64 bg-surface-active rounded-2xl" />
        <div className="h-10 w-32 bg-surface-active rounded-lg mx-auto" />
      </div>
    </div>
  )
}
