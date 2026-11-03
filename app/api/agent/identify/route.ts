import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { resolveSteamApp } from '@/lib/steam-games'
import { findGameByExactName } from '@/lib/name-games'
import { resolveExeCandidate } from '@/lib/exe-catalog'
import { normaliseExeName } from '@/lib/agent-session'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'
import { getVersionParent } from '@/lib/igdb'

export const dynamic = 'force-dynamic'

/**
 * "What is this running game, and can I track it?"
 *
 * Four ways to ask, and the agent uses whichever it actually has:
 *
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
 *   lookupExe  — no local signal of any kind, just the raw exe name (plus,
 *                optionally, the install `installPath` the agent found it
 *                running from). Checked against `global_exe_links`, which
 *                holds both admin-curated rows and a much larger bulk-
 *                imported catalog (`scripts/import-exe-catalog.mjs`). An exe
 *                name used by more than one title (an unrelated launcher and
 *                an unrelated game sharing a name, say) is only trusted when
 *                `installPath` disambiguates to exactly one row's
 *                `folder_hint` — otherwise it's `unknown`, same as a miss,
 *                rather than risk guessing between two different games. A
 *                catalog row with no `igdb_id` yet (every bulk-imported row
 *                starts this way) is resolved via the same exact-match title
 *                search as `titleGuess`, and the result is cached back onto
 *                the row — so every subsequent user hitting that exe gets the
 *                instant path, and the resolution only ever happens once.
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
 * shape, just written automatically instead of by a click.
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

  if ([hasAppId, hasTitle, hasPicked, hasLookup].filter(Boolean).length !== 1) {
    return NextResponse.json({ error: 'exactly one of steamAppId, titleGuess, igdbId or lookupExe is required' }, { status: 400 })
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

  // All three paths resolve to the same shape, so everything below is shared.
  let igdbId: number
  let resolvedName: string
  if (hasAppId) {
    const lookup = await resolveSteamApp(sb as any, appId)
    if (lookup.kind === 'unknown') return NextResponse.json({ result: 'unknown' })
    if (lookup.kind === 'notAGame') return NextResponse.json({ result: 'notAGame' })
    igdbId = lookup.igdbId
    resolvedName = lookup.name
  } else if (hasTitle) {
    const lookup = await findGameByExactName(titleGuess!)
    if (lookup.kind === 'noMatch') return NextResponse.json({ result: 'unknown' })
    igdbId = lookup.igdbId
    resolvedName = lookup.name
  } else if (hasLookup) {
    const { data: rows } = await (sb.from('global_exe_links') as any)
      .select('id, igdb_id, title, folder_hint')
      .eq('exe_name', normaliseExeName(body.exeName))
    const installPath = typeof body?.installPath === 'string' ? body.installPath : null
    const match = resolveExeCandidate(rows ?? [], installPath)
    if (!match) return NextResponse.json({ result: 'unknown' })

    if (match.igdb_id != null) {
      igdbId = match.igdb_id
      resolvedName = match.title
    } else {
      const lookup = await findGameByExactName(match.title)
      if (lookup.kind === 'noMatch') return NextResponse.json({ result: 'unknown' })
      igdbId = lookup.igdbId
      resolvedName = lookup.name
      // Self-optimising: every subsequent user hitting this exe gets the
      // instant igdb_id path, so this resolution only has to happen once.
      await (sb.from('global_exe_links') as any).update({ igdb_id: igdbId }).eq('id', match.id)
    }
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
    }, { onConflict: 'user_id,exe_name' })
    if (error) console.error(`identify: could not link ${exeName} to ${gameId}: ${error.message}`)
  }

  // Already theirs? Match on the Steam id first where we have one — it is
  // exact — then on the IGDB id, which catches a copy added before Steam ids
  // were being stored, or one found by name in the first place.
  const ownedQuery = hasAppId ? `steam_appid.eq.${appId},igdb_id.eq.${igdbId}` : `igdb_id.eq.${igdbId}`
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
      if (existing && hasAppId) editionSteamAppId = appId
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
      steam_appid: hasAppId ? appId : null,
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
