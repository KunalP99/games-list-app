import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WheelClient from '@/components/wheel/WheelClient'
import type { WheelTurn } from '@/lib/types'

export default async function WheelPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('wheel_turn, ticket_balance')
    .eq('id', user.id)
    .single() as { data: { wheel_turn: WheelTurn; ticket_balance: number } | null }

  if (!profile) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg-base">Wheel Spin</h1>
        <p className="text-sm text-fg-muted mt-0.5">Spin to decide what you play next</p>
      </div>
      <WheelClient turn={profile.wheel_turn} balance={profile.ticket_balance} />
    </div>
  )
}
