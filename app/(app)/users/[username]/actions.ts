'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/edition'
import { normaliseBio, normaliseLayout, type ProfileLayout } from '@/lib/profile-cards'
import type { ActionResult } from '@/lib/types'

/**
 * Saves the signed-in person's profile cards and bio (public edition). Both
 * are normalised first: nothing the browser sends is stored as it came.
 * Returns what was stored, so the page shows exactly that.
 */
export async function saveProfile(input: { layout: unknown; bio: unknown }): Promise<ActionResult<{ layout: ProfileLayout; bio: string | null }>> {
  if (!FEATURES.newProfile) return { success: false, error: 'Profiles can’t be edited on this site.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not signed in.' }

  // An empty list is kept (no cards is a choice); anything that isn't a list
  // would otherwise become the default layout, so refuse it instead.
  if (!Array.isArray(input.layout)) return { success: false, error: 'That layout couldn’t be read.' }
  const layout = normaliseLayout(input.layout)
  const bio = normaliseBio(input.bio)

  const { data, error } = await supabase
    .from('profiles')
    .update({ profile_layout: layout, bio })
    .eq('id', user.id)
    .select('username')
    .single()
  if (error || !data) return { success: false, error: 'Your profile couldn’t be saved. Try again.' }

  revalidatePath(`/users/${data.username}`)
  return { success: true, data: { layout, bio } }
}
