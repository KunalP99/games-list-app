import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const { data: games } = await supabase
    .from('games')
    .select('hours_played')
    .eq('user_id', user!.id) as { data: { hours_played: number | null }[] | null; error: unknown }

  const totalHours = games?.reduce((sum, g) => sum + (g.hours_played ?? 0), 0) ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">
          Welcome back, {profile?.display_name ?? profile?.username}
        </h1>
        <p className="mt-1 text-zinc-500 text-sm">Here&apos;s your GamesList overview.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Ticket Balance" value={`🎟️ ${profile?.ticket_balance ?? 0}`} />
        <StatCard
          label="Current Turn"
          value={formatTurn(profile?.wheel_turn ?? 'spin')}
        />
        <StatCard label="Games" value="—" href="/games" linkLabel="View list" />
        <StatCard label="Total Hours" value={`${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`} />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <QuickAction href="/games/new" label="Add a Game" icon="+" />
          <QuickAction href="/wheel" label="Spin the Wheel" icon="🎡" />
          <QuickAction href="/tickets" label="Ticket History" icon="🎟️" />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  href,
  linkLabel,
}: {
  label: string
  value: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900">{value}</p>
      {href && linkLabel && (
        <Link href={href} className="mt-2 text-xs text-violet-600 hover:text-violet-800 transition-colors">
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors"
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  )
}

function formatTurn(turn: string): string {
  const map: Record<string, string> = {
    spin: 'Spin',
    spin_reroll: 'Spin + Reroll',
    choose: 'Choose Game',
  }
  return map[turn] ?? turn
}
