'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TICKET_COSTS, TICKET_AWARDS, WHEEL_MIN_GAMES } from '@/lib/constants'
import { nextWheelTurn, pickWinner, decideWonGameAction } from '@/lib/wheel'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'
import type { WheelTurn } from '@/lib/types'
import { checkAndAwardAchievements } from '@/lib/achievements'
import { restoreSession, collapsePhase, type WheelSession } from '@/lib/wheel-session'

async function advanceTurn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  current: WheelTurn,
  wonGameId?: string | null,
) {
  // Also record the "pending" wheel outcome: the game this action produced and
  // the turn that produced it. DNF-ing that game reverts the turn (games/actions).
  // Any action that added no game clears the pointer, so only the MOST RECENT
  // wheel outcome is ever revertable.
  await (supabase.from('profiles') as any)
    .update({
      wheel_turn: nextWheelTurn(current),
      pending_wheel_game_id: wonGameId ?? null,
      pending_wheel_turn: wonGameId ? current : null,
      // The turn is over, so there is nothing left to resume. Every finalizing
      // action routes through here, so this one line covers them all.
      wheel_session: null,
    })
    .eq('id', userId)
}

// ─── Resumable turn state ───────────────────────────────────────────────────
// Persists the in-progress turn so closing the tab doesn't lose it. Paid
// actions write it themselves, in the same request that spends the tickets —
// otherwise a lost response means the tickets are gone with no record of what
// they bought.

async function persistSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  session: WheelSession,
) {
  const { error } = await (supabase.from('profiles') as any)
    .update({ wheel_session: session })
    .eq('id', userId)
  if (error) console.error('persistSession failed:', error.message)
}

// Merges a freshly-paid result into the client's session and stores it. The
// phase is collapsed to a stable one: the animation hasn't played yet, and on
// resume we jump straight to the settled outcome rather than replaying it.
// Elimination theatre is deliberately not reconstructed here — the client
// overwrites this with the full queue as soon as it starts animating, so this
// is purely the crash-safety copy.
function mergePaidResult(
  raw: unknown,
  patch: Partial<WheelSession>,
  spend?: { action: string; amount: number },
): WheelSession | null {
  const base = restoreSession(raw)
  if (!base) return null
  const merged: WheelSession = {
    ...base,
    ...patch,
    spends: spend ? [...base.spends, spend] : base.spends,
    spentThisTurn: base.spentThisTurn + (spend?.amount ?? 0),
  }
  return { ...merged, phase: collapsePhase(merged.phase) }
}

// Client-driven save for the cheap transitions (entry list, mode, reaching a
// stable phase). Validated and version-checked before it is stored.
export async function saveWheelSession(session: unknown) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const valid = restoreSession(session)
  if (!valid) return { error: 'Invalid session' }

  await persistSession(supabase, user.id, { ...valid, phase: collapsePhase(valid.phase) })
  return { success: true as const }
}

// Clearing is separate from advanceTurn so the client can reset without one.
export async function clearWheelSession() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  await (supabase.from('profiles') as any)
    .update({ wheel_session: null })
    .eq('id', user.id)
  return { success: true as const }
}

// Every wheel action routes through here, which makes it the one place to
// enforce the Settings opt-out: a user with wheel turns switched off reads as
// "no profile", and each caller already refuses on that (six guard `!profile`
// explicitly, six via `profile?.`). The UI hides the wheel and /wheel redirects
// when it's off, so reaching an action at all means a stale or hand-made
// request — the refusal is defence in depth, not a path anyone sees.
async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('wheel_turn, ticket_balance, wheel_enabled')
    .eq('id', userId)
    .single() as { data: { wheel_turn: WheelTurn; ticket_balance: number; wheel_enabled: boolean | null } | null }
  // Accounts predating the column read as opted in.
  if (data && !(data.wheel_enabled ?? true)) return null
  return data
}

// ─── Add a won game to the library as Playing ───────────────────────────────
// Reused by every finalizing action (spin / spin+reroll / choose / paid choose).
// Finds existing copies (a game can own several rows once replays exist),
// matching by rawg_id first and falling back to a case-insensitive title match
// so legacy entries without a rawg_id (free-text / un-enriched imports) are
// still recognised. Precedence:
//   • already Playing (incl. a replay in progress) → no-op, don't duplicate
//   • owned in Backlog                             → pull that row into Playing
//   • owned only as Completed                      → fresh Playing entry, flagged is_replay
//   • owned only as DNF (or nothing else)          → left untouched
//   • not owned at all                             → fresh Playing entry
// A null rawgGame (free-text winner) is a no-op.

type WonGame = { id: number; name: string; released: string | null; background_image: string | null }

// Every paid action taken during the turn, in order (e.g. Spin Again then
// Choose a Game), so history can show the full spend breakdown rather than a
// single aggregate total.
type TicketSpend = { action: string; amount: number }
const spendsOrNull = (spends?: TicketSpend[] | null) => (spends && spends.length > 0 ? spends : null)

// Returns the id of the game row that ended up as Playing (a flipped backlog
// copy or a fresh entry), or null when nothing was added (no-op / free-text).
async function addWonGameToLibrary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rawgGame: WonGame | null | undefined,
  platform?: string | null,
  artworkUrl?: string | null,
): Promise<string | null> {
  if (!rawgGame) return null

  const today = new Date().toISOString().split('T')[0]
  const plat = platform?.trim() || null
  const art = artworkUrl?.trim() || null // user-picked / custom image for the card + hero

  const byId = await (supabase.from('games') as any)
    .select('id, status')
    .eq('user_id', userId)
    .eq(PROVIDER_ID_COLUMN, rawgGame.id) as { data: { id: string; status: string }[] | null }
  let rows = byId.data ?? []

  // Fallback: a copy may exist without this rawg_id (free-text add, un-enriched
  // import, or a differently-linked edition). Only run when the id match found
  // nothing, so the precise id path stays authoritative for linked games.
  if (rows.length === 0) {
    const byTitle = await (supabase.from('games') as any)
      .select('id, status')
      .eq('user_id', userId)
      .ilike('title', rawgGame.name) as { data: { id: string; status: string }[] | null }
    rows = byTitle.data ?? []
  }

  const decision = decideWonGameAction(rows)
  if (decision.action === 'noop') return null

  // A backlog copy is pulled straight into playing (with the chosen platform + image).
  if (decision.action === 'flip') {
    await (supabase.from('games') as any)
      .update({
        status: 'playing',
        start_date: today,
        assigned_by: userId, // marks it as a wheel-assigned game (for achievements)
        ...(plat ? { platform: plat } : {}),
        ...(art ? { image_url: art, artwork_url: art } : {}),
      })
      .eq('id', decision.gameId)
      .eq('user_id', userId)
    return decision.gameId
  }

  // Fresh entry — a replay if a completed copy already exists.
  const { getRawgGameDetail } = await import('@/lib/rawg')
  const detail = await getRawgGameDetail(rawgGame.id)

  const { data: inserted } = await (supabase.from('games') as any).insert({
    user_id: userId,
    title: rawgGame.name,
    developer: detail?.developers?.[0]?.name ?? null,
    release_date: detail?.released ?? rawgGame.released,
    release_date_precision: 'full',
    status: 'playing',
    start_date: today,
    platform: plat,
    image_url: art ?? rawgGame.background_image,
    cover_image_url: detail?.cover_image ?? null,
    artwork_url: art ?? detail?.artwork_image ?? null,
    [PROVIDER_ID_COLUMN]: rawgGame.id,
    steam_appid: detail?.steam_app_id ?? null,
    description: detail?.description_raw ?? null,
    genres: detail?.genres?.map(g => g.name) ?? null,
    dominant_color: detail?.saturated_color ?? detail?.dominant_color ?? null,
    is_replay: decision.isReplay,
    assigned_by: userId, // marks it as a wheel-assigned game (for achievements)
  }).select('id').single() as { data: { id: string } | null }

  return inserted?.id ?? null
}

// ─── Initial spin (both SPIN and SPIN+REROLL turns) ─────────────────────────
// Just picks a winner — does NOT write a record or advance the turn.
// Finalization happens via acceptSpinResult / finalizeSpinReroll / paid options.

export async function performSpin(games: string[], mode: 'elimination' | 'first_land') {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }

  const turn = profile.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }
  if (games.length < WHEEL_MIN_GAMES) return { error: `Need at least ${WHEEL_MIN_GAMES} games.` }

  return { winner: pickWinner(games) }
}

// ─── SPIN turn — free accept ─────────────────────────────────────────────────

export async function acceptSpinResult(resultName: string, mode: 'elimination' | 'first_land', gamesList: string[], ticketsSpent: number, wonGame?: WonGame | null, finalizedVia: 'accept' | 'spin_again' = 'accept', spends?: TicketSpend[], platform?: string | null, artworkUrl?: string | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

  const wonId = await addWonGameToLibrary(supabase, user.id, wonGame, platform, artworkUrl)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: turn,
    spin_mode: mode,
    result_name: resultName,
    games_list: gamesList,
    tickets_spent: ticketsSpent > 0 ? ticketsSpent : null,
    finalized_via: finalizedVia,
    ticket_spends: spendsOrNull(spends),
  })
  await advanceTurn(supabase, user.id, turn, wonId)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

// ─── SPIN turn — paid: Spin Again (−3) ──────────────────────────────────────

export async function paySpinAgain(games: string[], exclude: string[] = [], session?: unknown) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  if (profile.wheel_turn !== 'spin' && profile.wheel_turn !== 'spin_reroll') return { error: 'Not a spin turn' }
  if (profile.ticket_balance < TICKET_COSTS.spin) {
    return { error: `Need ${TICKET_COSTS.spin} tickets, have ${profile.ticket_balance}.` }
  }
  if (games.length < WHEEL_MIN_GAMES) return { error: `Need at least ${WHEEL_MIN_GAMES} games.` }

  // Decide the winner BEFORE spending, so the result exists to be recorded.
  // Don't land on a game already seen this turn (unless that leaves nothing).
  const pool = games.filter(g => !exclude.includes(g))
  const winner = pickWinner(pool.length > 0 ? pool : games)

  const { error: spendError } = await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: -TICKET_COSTS.spin,
    p_reason: 'spin',
  })
  // Don't hand back a result the user wasn't charged for.
  if (spendError) return { error: `Could not spend tickets: ${spendError.message}` }

  // Record it immediately. Previously the winner existed only in this response,
  // so a closed tab meant 3 tickets gone and nothing to show for them.
  const merged = mergePaidResult(
    session,
    { winner, phase: 'spin_result', paidRespin: true, excludedGames: [...exclude, winner] },
    { action: 'spin_again', amount: TICKET_COSTS.spin },
  )
  if (merged) await persistSession(supabase, user.id, merged)

  return { winner }
}

// ─── SPIN/SPIN+REROLL — paid: Spin & Reroll upgrade (−6) ────────────────────
// Pays 6 tickets and picks the first new upgrade game.
// existingGames = games already known (1 from reroll_prompt, 2 from final_choice).
// Additional optional spins use pickNextUpgradeGame (already paid).

export async function payUpgradeToSpinReroll(
  games: string[],
  existingGames: string[],
  exclude: string[] = [],
  session?: unknown,
  upgradeMaxGames = 3,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  if (profile.wheel_turn !== 'spin' && profile.wheel_turn !== 'spin_reroll') return { error: 'Not a spin turn' }
  if (profile.ticket_balance < TICKET_COSTS.spin_reroll) {
    return { error: `Need ${TICKET_COSTS.spin_reroll} tickets, have ${profile.ticket_balance}.` }
  }

  // Decided before spending, so the result can be recorded alongside the charge.
  // Skip the current option(s) plus any games already seen this turn.
  const skip = new Set([...existingGames, ...exclude])
  const pool = games.filter(g => !skip.has(g))
  const nextGame = pickWinner(pool.length > 0 ? pool : games)

  const { error: spendError } = await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: -TICKET_COSTS.spin_reroll,
    p_reason: 'spin_reroll',
  })
  if (spendError) return { error: `Could not spend tickets: ${spendError.message}` }

  const merged = mergePaidResult(
    session,
    {
      phase: 'spin_upgrade_reroll_prompt',
      upgradeGames: [...existingGames, nextGame],
      upgradeMaxGames,
      excludedGames: [...exclude, nextGame],
    },
    { action: 'upgrade_choice', amount: TICKET_COSTS.spin_reroll },
  )
  if (merged) await persistSession(supabase, user.id, merged)

  return { nextGame }
}

export async function pickNextUpgradeGame(
  games: string[],
  excludeGames: string[],
  exclude: string[] = [],
  session?: unknown,
  upgradeMaxGames = 3,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

  const skip = new Set([...excludeGames, ...exclude])
  const pool = games.filter(g => !skip.has(g))
  const nextGame = pickWinner(pool.length > 0 ? pool : games)

  // Free (the 6 was already paid), but still worth recording — losing this
  // would strand the user in a flow they had paid to enter.
  const upgradeGames = [...excludeGames, nextGame]
  const merged = mergePaidResult(
    session,
    {
      phase: upgradeGames.length >= upgradeMaxGames
        ? 'spin_upgrade_final_choice'
        : 'spin_upgrade_reroll_prompt',
      upgradeGames,
      upgradeMaxGames,
      excludedGames: [...exclude, nextGame],
    },
    // No spend: the 6 tickets were charged by payUpgradeToSpinReroll.
  )
  if (merged) await persistSession(supabase, user.id, merged)

  return { nextGame }
}

export async function finalizeUpgradeChoice(
  chosen: string,
  allOptions: string[],
  mode: 'elimination' | 'first_land',
  gamesList: string[],
  ticketsSpent: number,
  wonGame?: WonGame | null,
  spends?: TicketSpend[],
  platform?: string | null,
  artworkUrl?: string | null,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

  const wonId = await addWonGameToLibrary(supabase, user.id, wonGame, platform, artworkUrl)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: turn,
    spin_mode: mode,
    option_a_name: allOptions[1] ?? null,
    option_b_name: allOptions[2] ?? null,
    result_name: chosen,
    games_list: gamesList,
    tickets_spent: ticketsSpent > 0 ? ticketsSpent : null,
    finalized_via: 'upgrade_choice',
    ticket_spends: spendsOrNull(spends),
  })
  await advanceTurn(supabase, user.id, turn, wonId)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

// ─── SPIN turn — paid: Choose Any Game (−9) ──────────────────────────────────

export async function payChooseAnyGame(gameName: string, mode: 'elimination' | 'first_land', gamesList: string[], priorTicketsSpent: number, wonGame?: WonGame | null, spends?: TicketSpend[], platform?: string | null, artworkUrl?: string | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  const turn = profile.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }
  if (profile.ticket_balance < TICKET_COSTS.choose_game) {
    return { error: `Need ${TICKET_COSTS.choose_game} tickets, have ${profile.ticket_balance}.` }
  }
  if (!gameName.trim()) return { error: 'Game name cannot be empty' }

  const { error: spendError } = await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: -TICKET_COSTS.choose_game,
    p_reason: 'choose_game',
  })
  // Bail rather than handing over a game the user wasn't charged for.
  if (spendError) return { error: `Could not spend tickets: ${spendError.message}` }

  const wonId = await addWonGameToLibrary(supabase, user.id, wonGame, platform, artworkUrl)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: turn,
    // The wheel was still spun this turn before paying to override the result,
    // so keep the mode — a genuine CHOOSE turn (chooseGame) is what leaves it null.
    spin_mode: mode,
    result_name: gameName.trim(),
    games_list: gamesList,
    tickets_spent: priorTicketsSpent + TICKET_COSTS.choose_game,
    finalized_via: 'choose_any',
    ticket_spends: spendsOrNull(spends),
  })

  await advanceTurn(supabase, user.id, turn, wonId)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

// ─── SPIN+REROLL turn ────────────────────────────────────────────────────────

export async function performReroll(games: string[], excludeGame: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (profile?.wheel_turn !== 'spin_reroll') return { error: 'Not a spin_reroll turn' }

  const pool = games.filter(g => g !== excludeGame)
  return { winner: pickWinner(pool.length > 0 ? pool : games) }
}

export async function finalizeSpinReroll(
  optionA: string,
  optionB: string,
  chosen: string,
  mode: 'elimination' | 'first_land',
  gamesList: string[],
  ticketsSpent: number,
  wonGame?: WonGame | null,
  spends?: TicketSpend[],
  platform?: string | null,
  artworkUrl?: string | null,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (profile?.wheel_turn !== 'spin_reroll') return { error: 'Not a spin_reroll turn' }

  const wonId = await addWonGameToLibrary(supabase, user.id, wonGame, platform, artworkUrl)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'spin_reroll',
    spin_mode: mode,
    option_a_name: optionA,
    option_b_name: optionB,
    result_name: chosen,
    games_list: gamesList,
    tickets_spent: ticketsSpent > 0 ? ticketsSpent : null,
    finalized_via: 'reroll_choice',
    ticket_spends: spendsOrNull(spends),
  })

  await advanceTurn(supabase, user.id, 'spin_reroll', wonId)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

// ─── CHOOSE turn ─────────────────────────────────────────────────────────────

export async function chooseGameWithRawg(rawgGame: {
  id: number
  name: string
  released: string | null
  background_image: string | null
}, platform?: string | null, artworkUrl?: string | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  if (profile.wheel_turn !== 'choose') return { error: 'Not a choose turn' }

  const wonId = await addWonGameToLibrary(supabase, user.id, rawgGame, platform, artworkUrl)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'choose',
    result_name: rawgGame.name,
    finalized_via: 'choose',
  })

  await advanceTurn(supabase, user.id, 'choose', wonId)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

export async function chooseGame(gameName: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  if (profile.wheel_turn !== 'choose') return { error: 'Not a choose turn' }
  if (!gameName.trim()) return { error: 'Game name cannot be empty' }

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'choose',
    result_name: gameName.trim(),
    finalized_via: 'choose',
  })

  await advanceTurn(supabase, user.id, 'choose')
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/achievements')
  return { success: true }
}

export async function skipChooseTurn() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (profile?.wheel_turn !== 'choose') return { error: 'Not a choose turn' }

  const { error: awardError } = await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: TICKET_AWARDS.turn_skipped,
    p_reason: 'turn_skipped',
  })
  // Don't burn the turn if the reward for skipping it never landed.
  if (awardError) return { error: `Could not award tickets: ${awardError.message}` }

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'choose_skip',
    finalized_via: 'skip',
  })

  await advanceTurn(supabase, user.id, 'choose')
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  return { success: true }
}
