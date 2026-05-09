'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TICKET_COSTS, TICKET_AWARDS, WHEEL_MIN_GAMES } from '@/lib/constants'
import { nextWheelTurn, pickWinner } from '@/lib/wheel'
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

export async function acceptSpinResult(resultName: string, mode: 'elimination' | 'first_land', gamesList: string[], ticketsSpent: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

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
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const turn = profile?.wheel_turn
  if (turn !== 'spin' && turn !== 'spin_reroll') return { error: 'Not a spin turn' }

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
  revalidatePath('/achievements')
  return { success: true }
}

// ─── SPIN turn — paid: Choose Any Game (−9) ──────────────────────────────────

export async function payChooseAnyGame(gameName: string, gamesList: string[], priorTicketsSpent: number) {
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
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  if (profile?.wheel_turn !== 'spin_reroll') return { error: 'Not a spin_reroll turn' }

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
  revalidatePath('/achievements')
  return { success: true }
}

// ─── CHOOSE turn ─────────────────────────────────────────────────────────────

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
