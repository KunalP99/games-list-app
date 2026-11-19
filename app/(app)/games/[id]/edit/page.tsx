import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import GameForm from '@/components/games/GameForm'
import { withOwnerNotes } from '@/lib/data/private-notes'

export default async function EditGamePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: row } = await supabase
    .from('games')
    .select('*')
    .eq('id', params.id)
    .single() as { data: Game | null }

  if (!row) notFound()
  if (row.user_id !== user?.id) redirect(`/games/${params.id}`)

  // Private notes live in their own table (lib/data/private-notes.ts).
  const game = await withOwnerNotes(supabase, row, user?.id)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Edit Game</h1>
        <p className="text-sm text-fg-muted mt-0.5">{game.title}</p>
      </div>
      <GameForm game={game} />
    </div>
  )
}
