import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import GameForm from '@/components/games/GameForm'

export default async function EditGamePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', params.id)
    .single() as { data: Game | null }

  if (!game) notFound()
  if (game.user_id !== user?.id) redirect(`/games/${params.id}`)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Edit Game</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{game.title}</p>
      </div>
      <GameForm game={game} />
    </div>
  )
}
