'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createGame(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const status = formData.get('status') as string

  const { data: game, error } = await (supabase.from('games') as any).insert({
    user_id: user.id,
    title: (formData.get('title') as string).trim(),
    developer: (formData.get('developer') as string)?.trim() || null,
    year_developed: formData.get('year_developed') ? Number(formData.get('year_developed')) : null,
    status,
    hours_played: formData.get('hours_played') ? Number(formData.get('hours_played')) : null,
    completion_date: status === 'completed' && formData.get('completion_date') ? formData.get('completion_date') as string : null,
    rating: status === 'completed' && formData.get('rating') ? Number(formData.get('rating')) : null,
    achievement_progress: formData.get('achievement_progress') ? Number(formData.get('achievement_progress')) : null,
    review: (formData.get('review') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    in_wheel: formData.get('in_wheel') === 'on',
  }).select('id').single()

  if (error) return { error: error.message }

  revalidatePath('/games')
  revalidatePath('/dashboard')
  redirect(`/games/${game.id}`)
}

export async function updateGame(id: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const status = formData.get('status') as string

  const { error } = await (supabase.from('games') as any).update({
    title: (formData.get('title') as string).trim(),
    developer: (formData.get('developer') as string)?.trim() || null,
    year_developed: formData.get('year_developed') ? Number(formData.get('year_developed')) : null,
    status,
    hours_played: formData.get('hours_played') ? Number(formData.get('hours_played')) : null,
    completion_date: status === 'completed' && formData.get('completion_date') ? formData.get('completion_date') as string : null,
    rating: status === 'completed' && formData.get('rating') ? Number(formData.get('rating')) : null,
    achievement_progress: formData.get('achievement_progress') ? Number(formData.get('achievement_progress')) : null,
    review: (formData.get('review') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    in_wheel: formData.get('in_wheel') === 'on',
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/games')
  revalidatePath(`/games/${id}`)
  revalidatePath('/dashboard')
  redirect(`/games/${id}`)
}

export async function deleteGame(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('games').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/games')
  revalidatePath('/dashboard')
  redirect('/games')
}
