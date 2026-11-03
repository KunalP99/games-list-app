import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { resolveSteamApp } from '@/lib/steam-games'
import { findGameByExactName } from '@/lib/name-games'
import { cleanSubmittedSuffix, uniqueByBasename } from '@/lib/detectable'
import { normaliseExeName } from '@/lib/agent-session'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'
import { getVersionParent } from '@/lib/igdb'

export const dynamic = 'force-dynamic'

type Sb = ReturnType<typeof createAdminClient>
type DetectableHit = { id: number; name: string; steam_appid: number | null; igdb_id: number | null }
type Resolved = { igdbId: number; name: string; steamAppId: number | null } | null

/**
 * A master-list row to an exact IGDB game: the admin's own igdb_id first,
 * then the row's Steam id through the same cache the Steam path uses, and
 * only then — for the ~2% with no store id — an exact-title search.
 */
async function resolveDetectable(sb: Sb, row: DetectableHit): Promise<Resolved> {
  if (row.igdb_id != null) return { igdbId: row.igdb_id, name: row.name, steamAppId: row.steam_appid }
  if (row.steam_appid != null) {
    const lookup = await resolveSteamApp(sb as any, row.steam_appid)
    if (lookup.kind === 'game') return { igdbId: lookup.igdbId, name: lookup.name, steamAppId: row.steam_appid }
    // notAGame/unknown: IGDB doesn't map this Steam id. The list still says
    // it's a game, so fall through to its name rather than giving up.
  }
  const byName = await findGameByExactName(row.name)
  return byName.kind === 'game' ? { igdbId: byName.igdbId, name: byName.name, steamAppId: null } : null
}

/** `_` and `%` are LIKE wildcards; exe names contain the former often. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

/**
 * "What is this running game, and can I track it?"
 *
 * Five ways to ask, and the agent uses whichever it actually has:
 *
 *   detectableId — the tracker matched the program's path against the master
 *                list (`/api/agent/detectable`) on the PC itself. Resolved via
 *                `resolveDetectable`: exact for admin rows and for the 97% of
 *                Discord rows with a Steam id.
 *   steamAppId — launched through Steam. Exact: the registry's app id maps to
 *                an exact IGDB game via `external_games`, or to nothing.
 *   titleGuess — launched through another launcher (Epic, GOG, …) whose own
 *                manifest names the game authoritatively, or guessed from the
 *                executable's own name when nothing else identified it. Still
 *                a search, not a lookup — IGDB keeps no cross-reference for
 *                these — so it is only trusted on an exact match once both
 *                names are reduced to bare lowercase letters and digits.
 *   igdbId     — a specific game a person picked themselves from the agent's
 *                own search panel. Nothing to resolve: they already chose it,
 *                so this skips straight to "already owned? else file it".
 *   lookupExe  — kept for trackers released before the master list: just
 *                the bare exe name. Checked against `detectable_games` by
 *                basename, and only trusted when every row with that name
 *                is the same game (`uniqueByBasename`) — `game.exe` belongs
 *                to 190+ games, so a bare name is often no answer at all.
 *
 * The answer decides everything that follows:
 *
 *   notAGame   — (steamAppId only) IGDB has no such game. Never ask again,
 *                never track it. This is what keeps Blender and Wallpaper
 *                Engine quiet without anyone maintaining a list by hand.
 *   unknown    — inconclusive: the lookup failed, or (titleGuess) nothing
 *                matched exactly. Decide nothing and leave it to the agent's
 *                ordinary heuristic prompt — never cached, never remembered,
 *                because a search miss is not proof of anything.
 *   tracked    — already in the library as Playing or Ambient. Just track it.
 *   untracked  — in the library, but completed, dropped or still in the
 *                backlog. Never moved without being asked — a background
 *                program silently deciding "this counts as Playing now"
 *                would be the wrong kind of automatic. Instead carries a
 *                `resumable` flag (`'completed'` | `'dnf'` | `'backlog'` |
 *                `null`) naming exactly which of the three it is, and the
 *                agent turns that into the matching prompt: "replay?" /
 *                "resuming?" / "set to Playing or Ambient?". Accepting any
 *                of them calls `/api/agent/resume`, which is what actually
 *                acts on it.
 *   added      — not in the library at all, so an Ambient row was created and
 *                tracking can start immediately.
 *
 * This route writes, despite the name: a game is filed the moment it is
 * recognised so its hours count from the first minute rather than from
 * whenever someone next opens the site. The agent says so in a toast, and the
 * row can be removed from there.
 *
 * `exeName` matters for everything *after* this response. A Steam game stays
 * recognisable on every future poll through its app id alone, but a
 * name-identified one (Epic, say) has no such signal — there is no
 * `RunningAppID` equivalent. Without saving an executable link here, the
 * agent's own "don't re-identify the same exe twice in one run" bookkeeping
 * would make a game unrecognisable again the very next tick: not trackable
 * via an app id, and not trackable via a link, because none was ever made.
 * So a `tracked`/`added` result upserts into `game_executables` exactly the
 * way a manual "Link a game" would — the identical table, the identical
 * shape, just written automatically instead of by a click. `pathSuffix`
 * (the exe plus its nearest telling folder, never the full path) rides
 * along for the admin queue on `/admin/exe-links`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Captured as its own const: TypeScript's narrowing of `identity` from the
  // check above does not reach inside the linkExe closure defined below.
  const userId = identity.userId

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const appId = body?.steamAppId
  const titleGuess = typeof body?.titleGuess === 'string' ? body.titleGuess.trim() : null
  const pickedIgdbId = body?.igdbId
  const pickedTitle = typeof body?.title === 'string' ? body.title.trim() : null
  const hasAppId = appId != null
  const hasTitle = !!titleGuess
  const hasPicked = pickedIgdbId != null
  const hasLookup = body?.lookupExe === true
  const detectableId = body?.detectableId
  const hasDetectable = detectableId != null

  if ([hasAppId, hasTitle, hasPicked, hasLookup, hasDetectable].filter(Boolean).length !== 1) {
    return NextResponse.json({ error: 'exactly one of steamAppId, titleGuess, igdbId, detectableId or lookupExe is required' }, { status: 400 })
  }
  if (hasDetectable && (typeof detectableId !== 'number' || !Number.isInteger(detectableId) || detectableId <= 0)) {
    return NextResponse.json({ error: 'detectableId must be a positive integer' }, { status: 400 })
  }
  // The other modes carry their own signal; this one is nothing but the exe
  // name, so unlike them it cannot be optional here.
  if (hasLookup && !(typeof body?.exeName === 'string' && body.exeName.trim())) {
    return NextResponse.json({ error: 'exeName is required alongside lookupExe' }, { status: 400 })
  }
  if (hasAppId && (typeof appId !== 'number' || !Number.isInteger(appId) || appId <= 0)) {
    return NextResponse.json({ error: 'steamAppId must be a positive integer' }, { status: 400 })
  }
  if (hasTitle && titleGuess!.length > 200) {
    return NextResponse.json({ error: 'titleGuess too long' }, { status: 400 })
  }
  if (hasPicked && (typeof pickedIgdbId !== 'number' || !Number.isInteger(pickedIgdbId) || pickedIgdbId <= 0)) {
    return NextResponse.json({ error: 'igdbId must be a positive integer' }, { status: 400 })
  }
  if (hasPicked && (!pickedTitle || pickedTitle.length > 200)) {
    return NextResponse.json({ error: 'title is required alongside igdbId' }, { status: 400 })
  }

  // Both optional, and both best-effort: an identify call with neither still
  // answers the "what is this?" question, it just cannot keep the game
  // recognisable afterwards or label its platform precisely.
  const exeName = typeof body?.exeName === 'string' && body.exeName.trim() && body.exeName.length <= 260
    ? normaliseExeName(body.exeName)
    : null
  const platform = typeof body?.platform === 'string' && body.platform.trim() ? body.platform.trim().slice(0, 100) : 'PC (Windows)'
  // Optional and silently dropped if it doesn't look like a short ending —
  // a bad suffix must never cost the user their identification.
  const pathSuffix = cleanSubmittedSuffix(body?.pathSuffix)

  // Every path resolves to the same shape, so everything below is shared.
  // `steamAppId` is the exact Steam id where one is known (the Steam path, or
  // a master-list row carrying one): it matches owned rows more precisely
  // than the IGDB id and is stored on a newly filed game.
  let igdbId: number
  let resolvedName: string
  let steamAppId: number | null = null
  if (hasAppId) {
    const lookup = await resolveSteamApp(sb as any, appId)
    if (lookup.kind === 'unknown') return NextResponse.json({ result: 'unknown' })
    if (lookup.kind === 'notAGame') return NextResponse.json({ result: 'notAGame' })
    igdbId = lookup.igdbId
    resolvedName = lookup.name
    steamAppId = appId
  } else if (hasTitle) {
    const lookup = await findGameByExactName(titleGuess!)
    if (lookup.kind === 'noMatch') return NextResponse.json({ result: 'unknown' })
    igdbId = lookup.igdbId
    resolvedName = lookup.name
  } else if (hasDetectable || hasLookup) {
    let row: DetectableHit | null = null
    if (hasDetectable) {
      const { data } = await (sb.from('detectable_games') as any)
        .select('id, name, steam_appid, igdb_id')
        .eq('id', detectableId)
        .maybeSingle()
      row = data ?? null
    } else {
      const exe = normaliseExeName(body.exeName)
      const columns = 'id, name, steam_appid, igdb_id, path_suffix, source, discord_id'
      const [{ data: bare }, { data: nested }] = await Promise.all([
        (sb.from('detectable_games') as any).select(columns).eq('path_suffix', exe),
        (sb.from('detectable_games') as any).select(columns).like('path_suffix', `%/${escapeLike(exe)}`),
      ])
      row = uniqueByBasename([...(bare ?? []), ...(nested ?? [])], exe)
    }
    const resolved = row ? await resolveDetectable(sb, row) : null
    if (!resolved) return NextResponse.json({ result: 'unknown' })
    igdbId = resolved.igdbId
    resolvedName = resolved.name
    steamAppId = resolved.steamAppId
  } else {
    // Picked directly from a search result — nothing to resolve or verify,
    // the person already chose this exact game.
    igdbId = pickedIgdbId
    resolvedName = pickedTitle!
  }

  // Links an executable to a game, the same upsert /api/agent/link uses.
  // Best-effort: the primary job here is answering what the game is, so a
  // link failure is logged, not surfaced as the whole request failing — the
  // one visible cost is the toast coming back next poll, which is the
  // pre-existing behaviour, not a new failure mode.
  async function linkExe(gameId: string) {
    if (!exeName) return
    const { error } = await (sb.from('game_executables') as any).upsert({
      user_id: userId,
      game_id: gameId,
      exe_name: exeName,
      // Only when known — an upsert without it must not wipe one already saved.
      ...(pathSuffix ? { path_suffix: pathSuffix } : {}),
    }, { onConflict: 'user_id,exe_name' })
    if (error) console.error(`identify: could not link ${exeName} to ${gameId}: ${error.message}`)
  }

  // Already theirs? Match on the Steam id first where we have one — it is
  // exact — then on the IGDB id, which catches a copy added before Steam ids
  // were being stored, or one found by name in the first place.
  const ownedQuery = steamAppId != null ? `steam_appid.eq.${steamAppId},igdb_id.eq.${igdbId}` : `igdb_id.eq.${igdbId}`
  const { data: owned } = await (sb.from('games') as any)
    .select('id, title, status')
    .eq('user_id', userId)
    .or(ownedQuery)
    .order('updated_at', { ascending: false })
    .limit(1)
  let existing = (owned ?? [])[0] as { id: string; title: string; status: string } | undefined
  // Picking the most-recently-updated matching row (above and in the
  // version_parent fallback below) is also what makes a replay the user has
  // already created by hand on the website — via the Add Game form's own
  // replay detection — take over automatically: that row is newer than the
  // original Completed one, so it's the one found here, already Playing,
  // with nothing special needed to recognise it.
  // Backfilled onto the matched row below, only when the match came from
  // this fallback — an exact `existing` match already has the right id.
  let editionSteamAppId: number | null = null

  // No exact match: this might still be the same game as one already owned,
  // just a different edition — "Dead Island: Game of the Year Edition" is
  // its own IGDB id (and, on Steam, its own app id) for what is really Dead
  // Island plus DLC. IGDB's own `version_parent` link catches that, when it
  // has one, without ever renaming or replacing the owned row.
  if (!existing) {
    const parentId = await getVersionParent(igdbId)
    if (parentId) {
      const { data: parentOwned } = await (sb.from('games') as any)
        .select('id, title, status')
        .eq('user_id', userId)
        .eq('igdb_id', parentId)
        .limit(1)
      existing = (parentOwned ?? [])[0] as { id: string; title: string; status: string } | undefined
      if (existing && steamAppId != null) editionSteamAppId = steamAppId
    }
  }

  if (existing) {
    const trackable = existing.status === 'playing' || existing.status === 'ambient'
    // Not for `untracked`: the agent cannot write hours to a backlog or
    // completed game anyway, so a link here would just be dead weight until
    // the user moves it themselves — at which point linking it by hand, or
    // simply launching it again once it is Playing, covers it.
    if (trackable) {
      await linkExe(existing.id)
      // So the next launch matches on steam_appid directly and never needs
      // this lookup again — the owned row otherwise has no app id at all, or
      // has a different edition's, since it was never this one running before.
      if (editionSteamAppId != null) {
        const { error } = await (sb.from('games') as any)
          .update({ steam_appid: editionSteamAppId })
          .eq('id', existing.id)
        if (error) console.error(`identify: could not backfill steam_appid onto ${existing.id}: ${error.message}`)
      }
    }
    return NextResponse.json({
      result: trackable ? 'tracked' : 'untracked',
      gameId: existing.id,
      title: existing.title,
      status: existing.status,
      igdbId,
      // Only meaningful when untracked — and since `trackable` is exactly
      // `status === 'playing' || status === 'ambient'`, `!trackable` always
      // means status is one of these three, with nothing else to filter.
      resumable: !trackable ? existing.status : null,
    })
  }

  // New to them: file it as Ambient, with the same metadata any other add
  // would get, so it does not sit in the library as a bare title.
  const { getRawgGameDetail } = await import('@/lib/rawg')
  const detail = await getRawgGameDetail(igdbId)

  const { data: created, error } = await (sb.from('games') as any)
    .insert({
      user_id: userId,
      title: detail?.name ?? resolvedName,
      developer: detail?.developers?.[0]?.name ?? null,
      status: 'ambient',
      platform,
      start_date: new Date().toISOString().slice(0, 10),
      steam_appid: steamAppId,
      [PROVIDER_ID_COLUMN]: igdbId,
      image_url: detail?.background_image ?? null,
      cover_image_url: detail?.cover_image ?? null,
      artwork_url: detail?.artwork_image ?? null,
      genres: detail?.genres?.map(g => g.name) ?? null,
      description: detail?.description_raw ?? null,
      release_date: detail?.released ?? null,
      release_date_precision: detail?.released ? 'full' : 'year',
      completion_date_precision: 'year',
      dominant_color: detail?.saturated_color ?? detail?.dominant_color ?? null,
    })
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await linkExe(created.id)

  return NextResponse.json({
    result: 'added',
    gameId: created.id,
    title: created.title,
    status: 'ambient',
    igdbId,
  })
}
