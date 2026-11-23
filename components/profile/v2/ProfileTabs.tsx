import Link from 'next/link'

/** Overview / Games, under the profile card. */
export default function ProfileTabs({
  username,
  active,
  gameCount,
}: {
  username: string
  active: 'overview' | 'games'
  /** Null when the viewer may not see their games. */
  gameCount: number | null
}) {
  const base = `/users/${encodeURIComponent(username)}`
  const tab = (href: string, label: React.ReactNode, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`rounded-lg px-4 py-2 text-sm transition-colors ${
        on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold' : 'text-fg-muted hover:text-fg-base'
      }`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Profile" className="inline-flex gap-1 rounded-xl border border-edge-base bg-surface-base p-1">
      {tab(base, 'Overview', active === 'overview')}
      {tab(`${base}/games`, <>Games{gameCount != null && <span className="ml-1.5 opacity-70 tabular-nums">{gameCount}</span>}</>, active === 'games')}
    </nav>
  )
}
