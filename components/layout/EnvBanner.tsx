// Unmistakable marker that the app is pointed at the throwaway test database
// rather than the real one. Renders only when NEXT_PUBLIC_APP_ENV=development,
// which is set in .env.dev.local and absent from the production env — so it can
// never appear on the deployed site.
//
// It also names the edition when it's the public one (lib/edition.ts), since
// the same local database can be run as either.
//
// Deliberately a fixed corner pill rather than a top bar: it can't be missed,
// but it also can't push the fixed nav around or change any layout being tested.
import { EDITION } from '@/lib/edition'

export default function EnvBanner() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== 'development') return null

  return (
    <div className="fixed bottom-3 left-3 z-[100] pointer-events-none select-none">
      <span className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-amber-950 shadow-lg ring-1 ring-amber-600/40">
        <span aria-hidden>🧪</span> TEST DATABASE{EDITION === 'public' && ' · PUBLIC EDITION'}
      </span>
    </div>
  )
}
