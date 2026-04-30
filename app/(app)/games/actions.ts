'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { awardCompletionTickets, applyDnfPenalty, reverseDnfPenalty } from '@/lib/tickets'
import { checkAndAwardAchievements, gameCompletionXp } from '@/lib/achievements'

async function awardGameCompletionXp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  hours: number | null,
  achievementProgress: number | null,
) {
  const xp = gameCompletionXp(hours, achievementProgress)
  if (xp > 0) {
    await (supabase.rpc as any)('award_xp', { p_user_id: userId, p_amount: xp })
  }
}

async function reverseGameCompletionTickets(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, gameId: string) {
  await (supabase.rpc as any)('reverse_game_completion_tickets', {
    p_user_id: userId,
    p_game_id: gameId,
  })
}

export async function createGame(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const status = formData.get('status') as string
  const hours = formData.get('hours_played') ? Number(formData.get('hours_played')) : null
  const achievementProgress = formData.get('achievement_progress') ? Number(formData.get('achievement_progress')) : null
  const rawgIdRaw = formData.get('rawg_id')
  const rawgId = rawgIdRaw ? Number(rawgIdRaw) : null

  let description: string | null = null
  let genres: string[] | null = null
  if (rawgId) {
    const { getRawgGameDetail } = await import('@/lib/rawg')
    const detail = await getRawgGameDetail(rawgId)
    description = detail?.description_raw ?? null
    genres = detail?.genres?.map(g => g.name) ?? null
  }

  const { data: game, error } = await (supabase.from('games') as any).insert({
    user_id: user.id,
    title: (formData.get('title') as string).trim(),
    developer: (formData.get('developer') as string)?.trim() || null,
    release_date: formData.get('release_date') || null,
    status,
    hours_played: hours,
    completion_date: (status === 'completed' || status === 'dnf') && formData.get('completion_date') ? formData.get('completion_date') as string : null,
    rating: (status === 'completed' || status === 'dnf') && formData.get('rating') ? Number(formData.get('rating')) : null,
    achievement_progress: achievementProgress,
    review: (formData.get('review') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    image_url: (formData.get('image_url') as string)?.trim() || null,
    rawg_id: rawgId,
    description,
    genres,
    platform: (formData.get('platform') as string) || null,
    is_favourite: formData.get('is_favourite') === 'on',
    is_replay: formData.get('is_replay') === 'on',
    is_sequel: formData.get('is_sequel') === 'on',
    in_wheel: false,
  }).select('id').single()

  if (error) return { error: error.message }

  if (status === 'completed') {
    await awardCompletionTickets(supabase, user.id, game.id, hours, achievementProgress)
    await awardGameCompletionXp(supabase, user.id, hours, achievementProgress)
  } else if (status === 'dnf') {
    await applyDnfPenalty(supabase, user.id, game.id)
  }

  await checkAndAwardAchievements(supabase, user.id)

  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/tickets')
  revalidatePath('/achievements')
  redirect(`/games/${game.id}`)
}

export async function updateGame(id: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch current status, rawg_id, and description before updating to detect transitions
  const { data: existing } = await (supabase.from('games') as any)
    .select('status, rawg_id, description, genres')
    .eq('id', id)
    .eq('user_id', user.id)
    .single() as { data: { status: string; rawg_id: number | null; description: string | null; genres: string[] | null } | null }

  const status = formData.get('status') as string
  const hours = formData.get('hours_played') ? Number(formData.get('hours_played')) : null
  const achievementProgress = formData.get('achievement_progress') ? Number(formData.get('achievement_progress')) : null
  const rawgIdRaw = formData.get('rawg_id')
  const rawgId = rawgIdRaw ? Number(rawgIdRaw) : null

  // Only re-fetch from RAWG if the rawg_id changed
  let description: string | null = existing?.description ?? null
  let genres: string[] | null = existing?.genres ?? null
  if (rawgId && rawgId !== existing?.rawg_id) {
    const { getRawgGameDetail } = await import('@/lib/rawg')
    const detail = await getRawgGameDetail(rawgId)
    description = detail?.description_raw ?? null
    genres = detail?.genres?.map(g => g.name) ?? null
  }

  const { error } = await (supabase.from('games') as any).update({
    title: (formData.get('title') as string).trim(),
    developer: (formData.get('developer') as string)?.trim() || null,
    release_date: formData.get('release_date') || null,
    status,
    hours_played: hours,
    completion_date: (status === 'completed' || status === 'dnf') && formData.get('completion_date') ? formData.get('completion_date') as string : null,
    rating: (status === 'completed' || status === 'dnf') && formData.get('rating') ? Number(formData.get('rating')) : null,
    achievement_progress: achievementProgress,
    review: (formData.get('review') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    image_url: (formData.get('image_url') as string)?.trim() || null,
    rawg_id: rawgId,
    description,
    genres,
    platform: (formData.get('platform') as string) || null,
    is_favourite: formData.get('is_favourite') === 'on',
    is_replay: formData.get('is_replay') === 'on',
    is_sequel: formData.get('is_sequel') === 'on',
    in_wheel: false,
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }

  const wasCompleted = existing?.status === 'completed'
  const isCompleted = status === 'completed'
  const wasDnf = existing?.status === 'dnf'
  const isDnf = status === 'dnf'

  if (wasCompleted && isCompleted) {
    // Editing a completed game — reverse old awards and re-award with new values
    await reverseGameCompletionTickets(supabase, user.id, id)
    await awardCompletionTickets(supabase, user.id, id, hours, achievementProgress)
  } else if (!wasCompleted && isCompleted) {
    // Newly completed — award tickets; also reverse any DNF penalty if coming from DNF
    if (wasDnf) await reverseDnfPenalty(supabase, user.id, id)
    await awardCompletionTickets(supabase, user.id, id, hours, achievementProgress)
    await awardGameCompletionXp(supabase, user.id, hours, achievementProgress)
  } else if (wasCompleted && !isCompleted) {
    // Un-completing — reverse completion awards; apply DNF penalty if moving to DNF
    await reverseGameCompletionTickets(supabase, user.id, id)
    if (isDnf) await applyDnfPenalty(supabase, user.id, id)
  } else if (!wasDnf && isDnf) {
    // Newly marked DNF
    await applyDnfPenalty(supabase, user.id, id)
  } else if (wasDnf && !isDnf) {
    // Removing DNF status
    await reverseDnfPenalty(supabase, user.id, id)
  }

  await checkAndAwardAchievements(supabase, user.id)

  revalidatePath('/games')
  revalidatePath(`/games/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/tickets')
  revalidatePath('/achievements')
  redirect(`/games/${id}`)
}

export async function markAsCompleted(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await (supabase.from('games') as any)
    .select('hours_played, achievement_progress')
    .eq('id', id)
    .eq('user_id', user.id)
    .single() as { data: { hours_played: number | null; achievement_progress: number | null } | null }

  const today = new Date().toISOString().split('T')[0]

  const { error } = await (supabase.from('games') as any)
    .update({ status: 'completed', completion_date: today })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  if (game) {
    await awardCompletionTickets(supabase, user.id, id, game.hours_played, game.achievement_progress)
    await awardGameCompletionXp(supabase, user.id, game.hours_played, game.achievement_progress)
  }

  await checkAndAwardAchievements(supabase, user.id)

  revalidatePath('/games')
  revalidatePath(`/games/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/tickets')
  revalidatePath('/achievements')
}

export async function deleteGame(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Reverse any earned tickets and remove their history rows before deletion
  const { data: game } = await (supabase.from('games') as any)
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single() as { data: { status: string } | null }

  if (game?.status === 'completed') {
    await reverseGameCompletionTickets(supabase, user.id, id)
  } else if (game?.status === 'dnf') {
    await reverseDnfPenalty(supabase, user.id, id)
  }

  const { error } = await supabase.from('games').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/games')
  revalidatePath('/dashboard')
  revalidatePath('/tickets')
  redirect('/games')
}
