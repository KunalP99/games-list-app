import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'
import { basename, isCovered } from '@/lib/detectable'
import { fetchAllDetectable } from '@/lib/detectable-import'
import AddDetectableForm from '@/components/admin/AddDetectableForm'
import DetectableQueueRow from '@/components/admin/DetectableQueueRow'
import { removeDetectable } from './actions'

type ImportRun = {
  started_at: string
  status: 'applied' | 'rejected' | 'failed'
  entries_seen: number | null
  rows_upserted: number | null
  rows_removed: number | null
  note: string | null
}
type AdminRow = { id: number; path_suffix: string; name: string; igdb_id: number | null; updated_at: string }
type Link = { exe_name: string; path_suffix: string | null; game_id: string; user_id: string }
type QueueItem = {
  key: string
  pathSuffix: string | null
  exeName: string
  gameTitle: string
  igdbId: number | null
  users: Set<string>
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

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

  // Admin client throughout: none of the master-list tables have RLS
  // policies, and the queue reads every user's game_executables rows.
  const admin = createAdminClient()

  const [listed, { data: runs }, { data: adminRows }, { data: dismissedRows }, { data: links }, { data: games }, { data: profiles }] = await Promise.all([
    fetchAllDetectable(admin, 'id, path_suffix, source') as Promise<{ path_suffix: string; source: string }[]>,
    (admin.from('detectable_import_runs') as any)
      .select('started_at, status, entries_seen, rows_upserted, rows_removed, note')
      .order('started_at', { ascending: false })
      .limit(10) as Promise<{ data: ImportRun[] | null }>,
    (admin.from('detectable_games') as any)
      .select('id, path_suffix, name, igdb_id, updated_at')
      .eq('source', 'admin')
      .order('updated_at', { ascending: false }) as Promise<{ data: AdminRow[] | null }>,
    (admin.from('detectable_dismissed') as any).select('path_suffix') as Promise<{ data: { path_suffix: string }[] | null }>,
    (admin.from('game_executables') as any).select('exe_name, path_suffix, game_id, user_id') as Promise<{ data: Link[] | null }>,
    (admin.from('games') as any).select(`id, title, ${PROVIDER_ID_COLUMN}`) as Promise<{ data: { id: string; title: string; [key: string]: unknown }[] | null }>,
    (admin.from('profiles') as any).select('id, username') as Promise<{ data: { id: string; username: string }[] | null }>,
  ])

  const listedSuffixes = new Set(listed.map(r => r.path_suffix))
  const listedNames = new Set(listed.map(r => basename(r.path_suffix)))
  const discordCount = listed.filter(r => r.source === 'discord').length
  const dismissed = new Set((dismissedRows ?? []).map(d => d.path_suffix))
  const gameById = new Map((games ?? []).map(g => [g.id, g]))
  const usernameById = new Map((profiles ?? []).map(p => [p.id, p.username]))

  const lastApplied = (runs ?? []).find(r => r.status === 'applied')
  // Problems since the last good import — the ones worth noticing.
  const recentProblems = (runs ?? []).filter(r =>
    r.status !== 'applied' && (!lastApplied || r.started_at > lastApplied.started_at))

  // Everyone's links the master list doesn't already cover, grouped by
  // (ending, game). A website link has no ending, only an exe name, so it
  // counts as covered when any listed ending has that exe name.
  const queue = new Map<string, QueueItem>()
  for (const link of links ?? []) {
    const key = link.path_suffix ?? link.exe_name
    if (dismissed.has(key)) continue
    if (link.path_suffix ? isCovered(link.path_suffix, listedSuffixes) : listedNames.has(link.exe_name)) continue
    const game = gameById.get(link.game_id)
    if (!game) continue
    const groupKey = `${key}|${game.id}`
    const username = usernameById.get(link.user_id) ?? 'someone'
    const existing = queue.get(groupKey)
    if (existing) {
      existing.users.add(username)
    } else {
      queue.set(groupKey, {
        key,
        pathSuffix: link.path_suffix,
        exeName: link.exe_name,
        gameTitle: game.title,
        igdbId: (game[PROVIDER_ID_COLUMN] as number | null) ?? null,
        users: new Set([username]),
      })
    }
  }
  const queueRows = Array.from(queue.values()).sort((a, b) => b.users.size - a.users.size)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Master game list</h1>
        <p className="mt-1 text-fg-muted text-sm">
          What every tracker recognises automatically, by the end of a running program&apos;s path. Seeded weekly from
          Discord&apos;s detection list; admin rows are added on top and win where both have the same ending.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Weekly import</h2>
        <div className="bg-surface-base border border-edge-base rounded-xl p-4 text-sm space-y-1">
          <p className="text-fg-base">
            {discordCount.toLocaleString()} endings from Discord · {(adminRows ?? []).length} added by admins
          </p>
          <p className="text-fg-muted">
            {lastApplied
              ? <>Last synced {fmt(lastApplied.started_at)} — {lastApplied.rows_upserted?.toLocaleString()} rows, {lastApplied.rows_removed ?? 0} removed{lastApplied.note ? ` (${lastApplied.note})` : ''}</>
              : <>Never synced. Run <code className="text-fg-subtle">node scripts/import-detectable.mjs</code>.</>}
          </p>
          {recentProblems.map(r => (
            <p key={r.started_at} className="text-amber-600">
              {fmt(r.started_at)}: {r.status} — {r.note ?? 'no detail'}. The previous list was kept.
            </p>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          What people have linked {queueRows.length > 0 && <span className="text-fg-subtle">({queueRows.length})</span>}
        </h2>
        <p className="text-xs text-fg-subtle">
          Programs people linked or added themselves that the list doesn&apos;t cover yet. They&apos;re tracked for
          the person already; approving one makes it automatic for everyone else.
        </p>
        {queueRows.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing to review.</p>
        ) : (
          <div className="bg-surface-base border border-edge-base rounded-xl divide-y divide-edge-subtle">
            {queueRows.map(row => (
              <DetectableQueueRow
                key={`${row.key}|${row.gameTitle}`}
                queueKey={row.key}
                pathSuffix={row.pathSuffix}
                exeName={row.exeName}
                gameTitle={row.gameTitle}
                igdbId={row.igdbId}
                users={Array.from(row.users)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Add an ending</h2>
        <AddDetectableForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Added by admins</h2>
        {!adminRows || adminRows.length === 0 ? (
          <p className="text-sm text-fg-subtle">None yet.</p>
        ) : (
          <div className="bg-surface-base border border-edge-base rounded-xl divide-y divide-edge-subtle">
            {adminRows.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg-base truncate">
                    <code className="text-fg-muted">{row.path_suffix}</code> → <span className="font-medium">{row.name}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">IGDB id: {row.igdb_id ?? '—'} · {fmt(row.updated_at)}</p>
                </div>
                <form action={removeDetectable.bind(null, row.id)}>
                  <button type="submit" className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
