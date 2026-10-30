import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { resolveSteamApp } from '@/lib/steam-games'
import { findGameByExactName } from '@/lib/name-games'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'

export const dynamic = 'force-dynamic'

/**
 * "What is this running game, and can I track it?"
 *
 * Two ways to ask, and the agent uses whichever it actually has:
 *
 *   steamAppId — launched through Steam. Exact: the registry's app id maps to
 *                an exact IGDB game via `external_games`, or to nothing.
 *   titleGuess — launched through another launcher (Epic, GOG, …) whose own
 *                manifest names the game authoritatively. Still a search, not
 *                a lookup — IGDB keeps no cross-reference for these stores —
 *                so it is only trusted on an exact match once both names are
 *                reduced to bare lowercase letters and digits.
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
 *                backlog. Left alone: moving it is the user's call, not a
 *                background program's.
 *   added      — not in the library at all, so an Ambient row was created and
 *                tracking can start immediately.
 *
 * This route writes, despite the name: a game is filed the moment it is
 * recognised so its hours count from the first minute rather than from
 * whenever someone next opens the site. The agent says so in a toast, and the
 * row can be removed from there.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const appId = body?.steamAppId
  const titleGuess = typeof body?.titleGuess === 'string' ? body.titleGuess.trim() : null
  const hasAppId = appId != null
  const hasTitle = !!titleGuess

  if (hasAppId === hasTitle) {
    return NextResponse.json({ error: 'exactly one of steamAppId or titleGuess is required' }, { status: 400 })
  }
  if (hasAppId && (typeof appId !== 'number' || !Number.isInteger(appId) || appId <= 0)) {
    return NextResponse.json({ error: 'steamAppId must be a positive integer' }, { status: 400 })
  }
  if (hasTitle && titleGuess!.length > 200) {
    return NextResponse.json({ error: 'titleGuess too long' }, { status: 400 })
  }

  // Both paths resolve to the same shape, so everything below is shared.
  let igdbId: number
  let resolvedName: string
  if (hasAppId) {
    const lookup = await resolveSteamApp(sb as any, appId)
    if (lookup.kind === 'unknown') return NextResponse.json({ result: 'unknown' })
    if (lookup.kind === 'notAGame') return NextResponse.json({ result: 'notAGame' })
    igdbId = lookup.igdbId
    resolvedName = lookup.name
  } else {
    const lookup = await findGameByExactName(titleGuess!)
    if (lookup.kind === 'noMatch') return NextResponse.json({ result: 'unknown' })
    igdbId = lookup.igdbId
    resolvedName = lookup.name
  }

  // Already theirs? Match on the Steam id first where we have one — it is
  // exact — then on the IGDB id, which catches a copy added before Steam ids
  // were being stored, or one found by name in the first place.
  const ownedQuery = hasAppId ? `steam_appid.eq.${appId},igdb_id.eq.${igdbId}` : `igdb_id.eq.${igdbId}`
  const { data: owned } = await (sb.from('games') as any)
    .select('id, title, status')
    .eq('user_id', identity.userId)
    .or(ownedQuery)
    .order('updated_at', { ascending: false })
    .limit(1)
  const existing = (owned ?? [])[0] as { id: string; title: string; status: string } | undefined

  if (existing) {
    const trackable = existing.status === 'playing' || existing.status === 'ambient'
    return NextResponse.json({
      result: trackable ? 'tracked' : 'untracked',
      gameId: existing.id,
      title: existing.title,
      status: existing.status,
      igdbId,
    })
  }

  // New to them: file it as Ambient, with the same metadata any other add
  // would get, so it does not sit in the library as a bare title.
  const { getRawgGameDetail } = await import('@/lib/rawg')
  const detail = await getRawgGameDetail(igdbId)

  const { data: created, error } = await (sb.from('games') as any)
    .insert({
      user_id: identity.userId,
      title: detail?.name ?? resolvedName,
      developer: detail?.developers?.[0]?.name ?? null,
      status: 'ambient',
      platform: 'PC',
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

  return NextResponse.json({
    result: 'added',
    gameId: created.id,
    title: created.title,
    status: 'ambient',
    igdbId,
  })
}
