import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { normaliseExeName } from '@/lib/agent-session'
import LinkExecutableForm from './LinkExecutableForm'

/**
 * Opened by the desktop agent when the user answers "No" to its guess, or from
 * the tray's "Link a game". Lives in the app rather than being a native window
 * so it picks up the user's accent, theme and fonts for free.
 */
export default async function LinkExecutablePage({
  searchParams,
}: {
  searchParams: { exe?: string; suggest?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const exe = searchParams.exe ? normaliseExeName(searchParams.exe) : ''

  // Existing links, so a wrong one can be removed rather than needing a
  // database edit.
  const { data: links } = await supabase
    .from('game_executables')
    .select('exe_name, game_id')
    .eq('user_id', user.id)
    .order('created_at') as { data: { exe_name: string; game_id: string }[] | null }

  const { data: games } = await supabase
    .from('games')
    .select('id, title, platform, hours_played, cover_image_url')
    .eq('user_id', user.id)
    // Both are tracked, so both are linkable.
    .in('status', ['playing', 'ambient'])
    .order('updated_at', { ascending: false }) as {
      data: { id: string; title: string; platform: string | null; hours_played: number | null; cover_image_url: string | null }[] | null
    }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Link a game</h1>
        <p className="text-sm text-fg-muted mt-0.5">
          {exe
            ? <>Tell us which game <span className="font-medium text-fg-secondary">{exe}</span> is, and its hours will be logged automatically from now on.</>
            : <>Pick the game you are playing, and we will remember the program it runs as.</>}
        </p>
      </div>

      {(games ?? []).length === 0 ? (
        <div className="bg-surface-base border border-edge-base rounded-xl p-6 text-center space-y-2">
          <p className="text-4xl">🎮</p>
          <p className="font-medium text-fg-secondary">Nothing being tracked</p>
          <p className="text-sm text-fg-subtle">
            Hours are logged for games marked Playing or Ambient. Set one and come back.
          </p>
          <Link href="/games?status=backlog" className="inline-block text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Go to your backlog →
          </Link>
        </div>
      ) : (
        <LinkExecutableForm exe={exe} games={games ?? []} suggested={searchParams.suggest ?? null} links={(links ?? []).map(l => ({ exeName: l.exe_name, gameId: l.game_id }))} />
      )}
    </div>
  )
}
