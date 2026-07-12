'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TICKET_COSTS, TICKET_AWARDS, WHEEL_MIN_GAMES } from '@/lib/constants'
import { nextWheelTurn, pickWinner, decideWonGameAction } from '@/lib/wheel'
import type { WheelTurn } from '@/lib/types'
import { checkAndAwardAchievements } from '@/lib/achievements'

async function advanceTurn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  current: WheelTurn,
) {
  await (supabase.from('profiles') as any)
    .update({ wheel_turn: nextWheelTurn(current) })
    .eq('id', userId)
}

async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('wheel_turn, ticket_balance')
    .eq('id', userId)
    .single() as { data: { wheel_turn: WheelTurn; ticket_balance: number } | null }
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

async function addWonGameToLibrary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rawgGame: WonGame | null | undefined,
) {
  if (!rawgGame) return

  const today = new Date().toISOString().split('T')[0]

  const byId = await (supabase.from('games') as any)
    .select('id, status')
    .eq('user_id', userId)
    .eq('rawg_id', rawgGame.id) as { data: { id: string; status: string }[] | null }
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
  if (decision.action === 'noop') return

  // A backlog copy is pulled straight into playing.
  if (decision.action === 'flip') {
    await (supabase.from('games') as any)
      .update({ status: 'playing', start_date: today })
      .eq('id', decision.gameId)
      .eq('user_id', userId)
    return
  }

  // Fresh entry — a replay if a completed copy already exists.
  const { getRawgGameDetail } = await import('@/lib/rawg')
  const detail = await getRawgGameDetail(rawgGame.id)

  await (supabase.from('games') as any).insert({
    user_id: userId,
    title: rawgGame.name,
    release_date: rawgGame.released,
    release_date_precision: 'full',
    status: 'playing',
    start_date: today,
    image_url: rawgGame.background_image,
    rawg_id: rawgGame.id,
    description: detail?.description_raw ?? null,
    genres: detail?.genres?.map(g => g.name) ?? null,
    dominant_color: detail?.saturated_color ?? detail?.dominant_color ?? null,
    is_replay: decision.isReplay,
  })
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

export async function acceptSpinResult(resultName: string, mode: 'elimination' | 'first_land', gamesList: string[], ticketsSpent: number, wonGame?: WonGame | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

  await addWonGameToLibrary(supabase, user.id, wonGame)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: turn,
    spin_mode: mode,
    result_name: resultName,
    games_list: gamesList,
    tickets_spent: ticketsSpent > 0 ? ticketsSpent : null,
  })
  await advanceTurn(supabase, user.id, turn)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

// ─── SPIN turn — paid: Spin Again (−3) ──────────────────────────────────────

export async function paySpinAgain(games: string[]) {
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

  await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: -TICKET_COSTS.spin,
    p_reason: 'spin',
  })

  return { winner: pickWinner(games) }
}

// ─── SPIN/SPIN+REROLL — paid: Spin & Reroll upgrade (−6) ────────────────────
// Pays 6 tickets and picks the first new upgrade game.
// existingGames = games already known (1 from reroll_prompt, 2 from final_choice).
// Additional optional spins use pickNextUpgradeGame (already paid).

export async function payUpgradeToSpinReroll(games: string[], existingGames: string[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  if (profile.wheel_turn !== 'spin' && profile.wheel_turn !== 'spin_reroll') return { error: 'Not a spin turn' }
  if (profile.ticket_balance < TICKET_COSTS.spin_reroll) {
    return { error: `Need ${TICKET_COSTS.spin_reroll} tickets, have ${profile.ticket_balance}.` }
  }

  await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: -TICKET_COSTS.spin_reroll,
    p_reason: 'spin_reroll',
  })

  const pool = games.filter(g => !existingGames.includes(g))
  return { nextGame: pickWinner(pool.length > 0 ? pool : games) }
}

export async function pickNextUpgradeGame(games: string[], excludeGames: string[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

  const pool = games.filter(g => !excludeGames.includes(g))
  return { nextGame: pickWinner(pool.length > 0 ? pool : games) }
}

export async function finalizeUpgradeChoice(
  chosen: string,
  allOptions: string[],
  mode: 'elimination' | 'first_land',
  gamesList: string[],
  ticketsSpent: number,
  wonGame?: WonGame | null,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

  await addWonGameToLibrary(supabase, user.id, wonGame)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: turn,
    spin_mode: mode,
    option_a_name: allOptions[1] ?? null,
    option_b_name: allOptions[2] ?? null,
    result_name: chosen,
    games_list: gamesList,
    tickets_spent: ticketsSpent > 0 ? ticketsSpent : null,
  })
  await advanceTurn(supabase, user.id, turn)
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/achievements')
  return { success: true }
}

// ─── SPIN turn — paid: Choose Any Game (−9) ──────────────────────────────────

export async function payChooseAnyGame(gameName: string, gamesList: string[], priorTicketsSpent: number, wonGame?: WonGame | null) {
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

  await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: -TICKET_COSTS.choose_game,
    p_reason: 'choose_game',
  })

  await addWonGameToLibrary(supabase, user.id, wonGame)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: turn,
    spin_mode: null,
    result_name: gameName.trim(),
    games_list: gamesList,
    tickets_spent: priorTicketsSpent + TICKET_COSTS.choose_game,
  })

  await advanceTurn(supabase, user.id, turn)
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
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (profile?.wheel_turn !== 'spin_reroll') return { error: 'Not a spin_reroll turn' }

  await addWonGameToLibrary(supabase, user.id, wonGame)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'spin_reroll',
    spin_mode: mode,
    option_a_name: optionA,
    option_b_name: optionB,
    result_name: chosen,
    games_list: gamesList,
    tickets_spent: ticketsSpent > 0 ? ticketsSpent : null,
  })

  await advanceTurn(supabase, user.id, 'spin_reroll')
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
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (!profile) return { error: 'Profile not found' }
  if (profile.wheel_turn !== 'choose') return { error: 'Not a choose turn' }

  await addWonGameToLibrary(supabase, user.id, rawgGame)

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'choose',
    result_name: rawgGame.name,
  })

  await advanceTurn(supabase, user.id, 'choose')
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

  await (supabase.rpc as any)('award_tickets', {
    p_user_id: user.id,
    p_amount: TICKET_AWARDS.turn_skipped,
    p_reason: 'turn_skipped',
  })

  await (supabase.from('wheel_spins') as any).insert({
    user_id: user.id,
    spin_type: 'choose_skip',
  })

  await advanceTurn(supabase, user.id, 'choose')
  await checkAndAwardAchievements(supabase, user.id)
  revalidatePath('/wheel')
  return { success: true }
}
