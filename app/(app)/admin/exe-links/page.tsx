import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'
import AddGlobalExeLinkForm from '@/components/admin/AddGlobalExeLinkForm'
import GlobalExeLinkRow from '@/components/admin/GlobalExeLinkRow'
import { promoteExeLink } from './actions'

type GlobalLink = { exe_name: string; igdb_id: number; title: string; cover_image_url: string | null }
type ReviewRow = { exeName: string; gameTitle: string; igdbId: number | null; users: string[] }

export default async function ExeLinksAdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single() as { data: { is_admin: boolean } | null }
  if (!profile?.is_admin) redirect('/dashboard')

  // Admin client throughout: the review queue is the one place meant to read
  // every user's game_executables rows, which ordinary RLS keeps owner-only.
  const admin = createAdminClient()

  const [{ data: globalLinks }, { data: personalLinks }, { data: games }, { data: profiles }] = await Promise.all([
    (admin.from('global_exe_links') as any)
      .select('exe_name, igdb_id, title, cover_image_url')
      .order('created_at', { ascending: false }) as Promise<{ data: GlobalLink[] | null }>,
    (admin.from('game_executables') as any).select('exe_name, game_id, user_id') as Promise<{ data: { exe_name: string; game_id: string; user_id: string }[] | null }>,
    (admin.from('games') as any).select(`id, title, ${PROVIDER_ID_COLUMN}`) as Promise<{ data: { id: string; title: string; [key: string]: unknown }[] | null }>,
    (admin.from('profiles') as any).select('id, username') as Promise<{ data: { id: string; username: string }[] | null }>,
  ])

  const gameById = new Map((games ?? []).map(g => [g.id, g]))
  const usernameById = new Map((profiles ?? []).map(p => [p.id, p.username]))
  const globalExeNames = new Set((globalLinks ?? []).map(l => l.exe_name))

  // Group everyone's personal links by (exe, game), skipping anything
  // already global — nothing to promote there.
  const grouped = new Map<string, { gameTitle: string; igdbId: number | null; users: Set<string> }>()
  for (const link of personalLinks ?? []) {
    if (globalExeNames.has(link.exe_name)) continue
    const game = gameById.get(link.game_id)
    if (!game) continue
    const key = `${link.exe_name}|${game.id}`
    const existing = grouped.get(key)
    const username = usernameById.get(link.user_id) ?? 'someone'
    if (existing) {
      existing.users.add(username)
    } else {
      grouped.set(key, {
        gameTitle: game.title,
        igdbId: (game[PROVIDER_ID_COLUMN] as number | null) ?? null,
        users: new Set([username]),
      })
    }
  }
  const reviewRows: (ReviewRow & { exeName: string })[] = Array.from(grouped.entries())
    .map(([key, v]) => ({ exeName: key.split('|')[0], gameTitle: v.gameTitle, igdbId: v.igdbId, users: Array.from(v.users) }))
    .sort((a, b) => b.users.length - a.users.length)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Global exe links</h1>
        <p className="mt-1 text-fg-muted text-sm">
          Admin-curated — once an executable is linked here, every user's agent recognises it automatically, with no toast.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Add a global link</h2>
        <AddGlobalExeLinkForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Current global links</h2>
        {!globalLinks || globalLinks.length === 0 ? (
          <p className="text-sm text-fg-subtle">None yet.</p>
        ) : (
          <div className="bg-surface-base border border-edge-base rounded-xl divide-y divide-edge-subtle">
            {globalLinks.map(link => (
              <GlobalExeLinkRow
                key={link.exe_name}
                exeName={link.exe_name}
                title={link.title}
                igdbId={link.igdb_id}
                coverImageUrl={link.cover_image_url}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">What people have linked</h2>
        {reviewRows.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing to review yet.</p>
        ) : (
          <div className="bg-surface-base border border-edge-base rounded-xl divide-y divide-edge-subtle">
            {reviewRows.map(row => (
              <div key={`${row.exeName}|${row.gameTitle}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg-base truncate">
                    <code className="text-fg-muted">{row.exeName}</code> → <span className="font-medium">{row.gameTitle}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {row.users.length} {row.users.length === 1 ? 'person' : 'people'}: {row.users.join(', ')}
                    {row.igdbId != null && <> · IGDB id: {row.igdbId}</>}
                  </p>
                </div>
                {row.igdbId != null && (
                  <form action={promoteExeLink.bind(null, row.exeName, row.igdbId, row.gameTitle)}>
                    <button type="submit" className="text-xs text-brand-600 hover:underline shrink-0">Promote to global</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
