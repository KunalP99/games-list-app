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
  const dlc = JSON.parse((formData.get('dlc') as string) || '[]') as { name: string; rawg_id: number | null; owned: boolean; removed?: boolean }[]

  const releaseDatePrecision = (formData.get('release_date_precision') as 'full' | 'year') || 'full'
  const releaseDate = releaseDatePrecision === 'year'
    ? (formData.get('release_date_year') ? `${formData.get('release_date_year')}-01-01` : null)
    : ((formData.get('release_date') as string) || null)

  const completionDatePrecision = (formData.get('completion_date_precision') as 'full' | 'year') || 'full'
  const completionDate = (status === 'completed' || status === 'dnf')
    ? (completionDatePrecision === 'year'
        ? (formData.get('completion_date_year') ? `${formData.get('completion_date_year')}-01-01` : null)
        : ((formData.get('completion_date') as string) || null))
    : null

  let description: string | null = null
  let genres: string[] | null = null
  let dominantColor: string | null = null
  if (rawgId) {
    const { getRawgGameDetail } = await import('@/lib/rawg')
    const detail = await getRawgGameDetail(rawgId)
    description = detail?.description_raw ?? null
    genres = detail?.genres?.map(g => g.name) ?? null
    dominantColor = detail?.saturated_color ?? detail?.dominant_color ?? null
  }

  const startDate = status !== 'backlog' ? ((formData.get('start_date') as string) || null) : null

  const { data: game, error } = await (supabase.from('games') as any).insert({
    user_id: user.id,
    title: (formData.get('title') as string).trim(),
    developer: (formData.get('developer') as string)?.trim() || null,
    release_date: releaseDate,
    release_date_precision: releaseDatePrecision,
    status,
    hours_played: hours,
    start_date: startDate,
    completion_date: completionDate,
    completion_date_precision: (status === 'completed' || status === 'dnf') ? completionDatePrecision : 'full',
    rating: (status === 'completed' || status === 'dnf') && formData.get('rating') ? Number(formData.get('rating')) : null,
    achievement_progress: achievementProgress,
    review: (formData.get('review') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    notes_public: formData.get('notes_public') === 'public',
    image_url: (formData.get('image_url') as string)?.trim() || null,
    rawg_id: rawgId,
    description,
    genres,
    dominant_color: dominantColor,
    platform: (formData.get('platform') as string) || null,
    is_favourite: formData.get('is_favourite') === 'on',
    is_replay: formData.get('is_replay') === 'on',
    is_sequel: formData.get('is_sequel') === 'on',
    in_wheel: false,
    youtube_playlist_url: (formData.get('youtube_playlist_url') as string)?.trim() || null,
    dlc,
  }).select('id').single()

  if (error) return { error: error.message }

  if (status === 'completed') {
    await awardCompletionTickets(supabase, user.id, game.id, hours, achievementProgress)
    await Promise.all([
      awardGameCompletionXp(supabase, user.id, hours, achievementProgress),
      checkAndAwardAchievements(supabase, user.id),
    ])
  } else if (status === 'dnf') {
    await applyDnfPenalty(supabase, user.id, game.id)
    await checkAndAwardAchievements(supabase, user.id)
  } else {
    await checkAndAwardAchievements(supabase, user.id)
  }

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
    .select('status, rawg_id, description, genres, dominant_color, hours_played, achievement_progress')
    .eq('id', id)
    .eq('user_id', user.id)
    .single() as { data: { status: string; rawg_id: number | null; description: string | null; genres: string[] | null; dominant_color: string | null; hours_played: number | null; achievement_progress: number | null } | null }

  const status = formData.get('status') as string
  const hours = formData.get('hours_played') ? Number(formData.get('hours_played')) : null
  const achievementProgress = formData.get('achievement_progress') ? Number(formData.get('achievement_progress')) : null
  const rawgIdRaw = formData.get('rawg_id')
  const rawgId = rawgIdRaw ? Number(rawgIdRaw) : null
  const dlc = JSON.parse((formData.get('dlc') as string) || '[]') as { name: string; rawg_id: number | null; owned: boolean; removed?: boolean }[]

  const releaseDatePrecision = (formData.get('release_date_precision') as 'full' | 'year') || 'full'
  const releaseDate = releaseDatePrecision === 'year'
    ? (formData.get('release_date_year') ? `${formData.get('release_date_year')}-01-01` : null)
    : ((formData.get('release_date') as string) || null)

  const completionDatePrecision = (formData.get('completion_date_precision') as 'full' | 'year') || 'full'
  const completionDate = (status === 'completed' || status === 'dnf')
    ? (completionDatePrecision === 'year'
        ? (formData.get('completion_date_year') ? `${formData.get('completion_date_year')}-01-01` : null)
        : ((formData.get('completion_date') as string) || null))
    : null

  // Only re-fetch from RAWG if the rawg_id changed
  let description: string | null = existing?.description ?? null
  let genres: string[] | null = existing?.genres ?? null
  let dominantColor: string | null = existing?.dominant_color ?? null
  if (rawgId && rawgId !== existing?.rawg_id) {
    const { getRawgGameDetail } = await import('@/lib/rawg')
    const detail = await getRawgGameDetail(rawgId)
    description = detail?.description_raw ?? null
    genres = detail?.genres?.map(g => g.name) ?? null
    dominantColor = detail?.saturated_color ?? detail?.dominant_color ?? null
  }

  const startDate = status !== 'backlog' ? ((formData.get('start_date') as string) || null) : null

  const { error } = await (supabase.from('games') as any).update({
    title: (formData.get('title') as string).trim(),
    developer: (formData.get('developer') as string)?.trim() || null,
    release_date: releaseDate,
    release_date_precision: releaseDatePrecision,
    status,
    hours_played: hours,
    start_date: startDate,
    completion_date: completionDate,
    completion_date_precision: (status === 'completed' || status === 'dnf') ? completionDatePrecision : 'full',
    rating: (status === 'completed' || status === 'dnf') && formData.get('rating') ? Number(formData.get('rating')) : null,
    achievement_progress: achievementProgress,
    review: (formData.get('review') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    notes_public: formData.get('notes_public') === 'public',
    image_url: (formData.get('image_url') as string)?.trim() || null,
    rawg_id: rawgId,
    description,
    genres,
    dominant_color: dominantColor,
    platform: (formData.get('platform') as string) || null,
    is_favourite: formData.get('is_favourite') === 'on',
    is_replay: formData.get('is_replay') === 'on',
    is_sequel: formData.get('is_sequel') === 'on',
    in_wheel: false,
    youtube_playlist_url: (formData.get('youtube_playlist_url') as string)?.trim() || null,
    dlc,
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }

  const wasCompleted = existing?.status === 'completed'
  const isCompleted = status === 'completed'
  const wasDnf = existing?.status === 'dnf'
  const isDnf = status === 'dnf'

  if (wasCompleted && isCompleted) {
    // Only reverse+re-award if the ticket-relevant fields changed
    const hoursChanged = hours !== (existing?.hours_played ?? null)
    const achievementChanged = achievementProgress !== (existing?.achievement_progress ?? null)
    if (hoursChanged || achievementChanged) {
      await reverseGameCompletionTickets(supabase, user.id, id)
      await awardCompletionTickets(supabase, user.id, id, hours, achievementProgress)
    }
    await checkAndAwardAchievements(supabase, user.id)
  } else if (!wasCompleted && isCompleted) {
    // Newly completed — award tickets; also reverse any DNF penalty if coming from DNF
    if (wasDnf) await reverseDnfPenalty(supabase, user.id, id)
    await awardCompletionTickets(supabase, user.id, id, hours, achievementProgress)
    await Promise.all([
      awardGameCompletionXp(supabase, user.id, hours, achievementProgress),
      checkAndAwardAchievements(supabase, user.id),
    ])
  } else if (wasCompleted && !isCompleted) {
    // Un-completing — reverse completion awards; apply DNF penalty if moving to DNF
    await reverseGameCompletionTickets(supabase, user.id, id)
    if (isDnf) await applyDnfPenalty(supabase, user.id, id)
    await checkAndAwardAchievements(supabase, user.id)
  } else if (!wasDnf && isDnf) {
    // Newly marked DNF
    await applyDnfPenalty(supabase, user.id, id)
    await checkAndAwardAchievements(supabase, user.id)
  } else if (wasDnf && !isDnf) {
    // Removing DNF status
    await reverseDnfPenalty(supabase, user.id, id)
    await checkAndAwardAchievements(supabase, user.id)
  } else {
    await checkAndAwardAchievements(supabase, user.id)
  }

  revalidatePath('/games')
  revalidatePath(`/games/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/tickets')
  revalidatePath('/achievements')
  redirect(`/games/${id}`)
}

export async function markAsCompleted(
  id: string,
  details?: {
    hours: number | null
    rating: number | null
    achievementProgress: number | null
    completionDate: string
    review: string | null
  },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let hours: number | null
  let achievementProgress: number | null
  const update: Record<string, unknown> = { status: 'completed' }

  if (details) {
    // Modal path — write everything the user supplied
    hours = details.hours
    achievementProgress = details.achievementProgress
    update.hours_played = hours
    update.rating = details.rating
    update.achievement_progress = achievementProgress
    update.completion_date = details.completionDate
    if (details.review !== null) update.review = details.review
  } else {
    // Card quick-complete — read existing values for ticket calculation only
    const { data: game } = await (supabase.from('games') as any)
      .select('hours_played, achievement_progress')
      .eq('id', id)
      .eq('user_id', user.id)
      .single() as { data: { hours_played: number | null; achievement_progress: number | null } | null }
    hours = game?.hours_played ?? null
    achievementProgress = game?.achievement_progress ?? null
    update.completion_date = new Date().toISOString().split('T')[0]
  }

  const { error } = await (supabase.from('games') as any)
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  await awardCompletionTickets(supabase, user.id, id, hours, achievementProgress)
  await Promise.all([
    awardGameCompletionXp(supabase, user.id, hours, achievementProgress),
    checkAndAwardAchievements(supabase, user.id),
  ])

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

export async function addRecommendationToBacklog(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const title = formData.get('title') as string
  const developer = formData.get('developer') as string | null
  const image_url = formData.get('image_url') as string | null
  const genres = JSON.parse((formData.get('genres') as string) || '[]')
  const rawgIdRaw = formData.get('rawg_id')
  const rawgId = rawgIdRaw ? Number(rawgIdRaw) : null
  let releaseDate = (formData.get('release_date') as string) || null

  // Enrich from RAWG when the recommended game carries a rawg_id — keeps the
  // backlog row consistent with games added via the form/wheel (description,
  // colour, precise release date) and lets the wheel show cover art + auto-add
  // the game to the library on a win (matched by rawg_id).
  let description: string | null = null
  let dominantColor: string | null = null
  let finalGenres: string[] = genres || []
  if (rawgId) {
    const { getRawgGameDetail } = await import('@/lib/rawg')
    const detail = await getRawgGameDetail(rawgId)
    description = detail?.description_raw ?? null
    dominantColor = detail?.saturated_color ?? detail?.dominant_color ?? null
    if (detail?.genres?.length) finalGenres = detail.genres.map(g => g.name)
    releaseDate = detail?.released ?? releaseDate
  }

  const { error } = await supabase.from('games').insert({
    user_id: user.id,
    title,
    developer: developer || null,
    image_url: image_url || null,
    genres: finalGenres,
    status: 'backlog',
    rawg_id: rawgId,
    release_date: releaseDate,
    release_date_precision: releaseDate ? 'full' : 'year',
    completion_date_precision: 'year',
    description,
    dominant_color: dominantColor,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/games')
  return { success: true }
}
