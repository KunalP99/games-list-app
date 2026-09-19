import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WheelClient from '@/components/wheel/WheelClient'
import { providerIdOf } from '@/lib/rawg'
import type { WheelTurn } from '@/lib/types'

export default async function WheelPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, backlogGamesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('wheel_turn, ticket_balance, accent_colour, wheel_session, wheel_enabled')
      .eq('id', user.id)
      .single(),
    supabase
      .from('games')
      .select('id, title, rawg_id, igdb_id, image_url, cover_image_url, release_date')
      .eq('user_id', user.id)
      .eq('status', 'backlog')
      .order('title', { ascending: true }),
  ])

  const profile = profileRes.data as {
    wheel_turn: WheelTurn
    ticket_balance: number
    accent_colour: string | null
    // An in-progress turn, or null. Validated client-side by restoreSession.
    wheel_session: unknown
    wheel_enabled: boolean | null
  } | null
  const backlogGames = backlogGamesRes.data as {
    id: string
    title: string
    rawg_id: number | null
    igdb_id: number | null
    image_url: string | null
    cover_image_url: string | null
    release_date: string | null
  }[] | null

  if (!profile) redirect('/login')

  // Opted out of wheel turns in Settings — the nav hides this page, so anyone
  // landing here came from a stale link or typed the URL. Guarded here rather
  // than in middleware.ts, which never touches `profiles` and shouldn't take a
  // DB round-trip on every request. Page-level is also naturally path-exact,
  // so /wheel/history stays reachable, which is the agreed behaviour.
  if (!(profile.wheel_enabled ?? true)) redirect('/dashboard')

  // Unreleased games can't be played yet, so keep them off the wheel until their
  // release date passes (games with no date are treated as available).
  const today = new Date().toISOString().slice(0, 10)
  const playableBacklog = (backlogGames ?? []).filter(g => !g.release_date || g.release_date <= today)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg-base">Wheel Spin</h1>
        <p className="text-sm text-fg-muted mt-0.5">Spin to decide what you play next</p>
      </div>
      <WheelClient
        turn={profile.wheel_turn}
        balance={profile.ticket_balance}
        accentColour={profile.accent_colour ?? '#7c3aed'}
        savedSession={profile.wheel_session ?? null}
        backlogGames={playableBacklog.map(g => {
          const pid = providerIdOf(g) // igdb_id in IGDB mode, else rawg_id
          return {
            name: g.title,
            rawg: pid
              ? { id: pid, name: g.title, released: g.release_date, background_image: g.image_url, cover_image: g.cover_image_url }
              : null,
          }
        })}
      />
    </div>
  )
}
