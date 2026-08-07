import Link from 'next/link'

export type PlayedByUser = {
  id: string
  username: string
  displayName: string | null
  accentColour: string | null
  status: 'playing' | 'completed'
}

// Small sidebar card listing other users who have this same game — currently
// playing it or completed it. Each links to that user's profile.
export default function PlayedByCard({ players }: { players: PlayedByUser[] }) {
  if (players.length === 0) return null
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4">
      <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-3">
        Also played by · {players.length}
      </p>
      <ul className="space-y-1.5">
        {players.map(p => {
          const name = p.displayName ?? p.username
          const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
          return (
            <li key={p.id}>
              <Link href={`/users/${encodeURIComponent(p.username)}`} className="group flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: p.accentColour ?? '#7c3aed' }}
                >
                  {initials}
                </span>
                <span className="flex-1 min-w-0 text-sm text-fg-base truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {name}
                </span>
                {p.status === 'playing' ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Playing
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-fg-subtle">Completed</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
