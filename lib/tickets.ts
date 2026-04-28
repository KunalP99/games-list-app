import type { SupabaseClient } from '@supabase/supabase-js'
import { TICKET_AWARDS, TICKET_PENALTIES } from './constants'

type AwardEntry = { reason: string; amount: number }

export function calculateCompletionAwards(
  hours: number | null,
  achievementProgress: number | null,
): AwardEntry[] {
  const awards: AwardEntry[] = []

  // Base completion award by hours
  const h = hours ?? 0
  if (h < 20) {
    awards.push({ reason: 'game_completed_short', amount: TICKET_AWARDS.game_completed_short })
  } else if (h < 50) {
    awards.push({ reason: 'game_completed_medium', amount: TICKET_AWARDS.game_completed_medium })
  } else {
    awards.push({ reason: 'game_completed_long', amount: TICKET_AWARDS.game_completed_long })
    // Bonus: +1 per 20 hrs beyond 100
    const bonus = Math.floor(Math.max(0, h - 100) / 20)
    if (bonus > 0) {
      awards.push({ reason: 'game_completed_bonus_hours', amount: bonus * TICKET_AWARDS.game_completed_bonus_hours })
    }
  }

  // 100% achievements bonus
  if (achievementProgress === 100) {
    awards.push({ reason: 'achievement_100_percent', amount: TICKET_AWARDS.achievement_100_percent })
  }

  return awards
}

export async function awardCompletionTickets(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  hours: number | null,
  achievementProgress: number | null,
) {
  const awards = calculateCompletionAwards(hours, achievementProgress)
  for (const { reason, amount } of awards) {
    await supabase.rpc('award_tickets', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_game_id: gameId,
    })
  }
  await checkAndAwardSequelBonus(supabase, userId, gameId)
}

export async function applyDnfPenalty(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
) {
  const { error } = await (supabase.rpc as any)('award_tickets', {
    p_user_id: userId,
    p_amount: TICKET_PENALTIES.assigned_game_incomplete,
    p_reason: 'assigned_game_incomplete',
    p_game_id: gameId,
  })
  if (error) throw new Error(`applyDnfPenalty failed: ${error.message}`)
}

export async function reverseDnfPenalty(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
) {
  const { error } = await (supabase.rpc as any)('reverse_game_dnf_tickets', {
    p_user_id: userId,
    p_game_id: gameId,
  })
  if (error) throw new Error(`reverseDnfPenalty failed: ${error.message}`)
}

async function checkAndAwardSequelBonus(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
) {
  const { data: game } = await supabase
    .from('games')
    .select('is_sequel')
    .eq('id', gameId)
    .single()

  if (!game?.is_sequel) return

  await supabase.rpc('award_tickets', {
    p_user_id: userId,
    p_amount: TICKET_AWARDS.sequel_back_to_back,
    p_reason: 'sequel_back_to_back',
    p_game_id: gameId,
  })
}
