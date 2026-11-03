'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanSubmittedSuffix } from '@/lib/detectable'

type Result = { success: true } | { success: false; error: string }

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single() as { data: { is_admin: boolean } | null }
  return profile?.is_admin ? user : null
}

/**
 * Add a path ending to the master list as an admin row, pointing at an exact
 * IGDB game. Every tracker picks it up at its next daily list check. Where a
 * Discord row has the same ending, this one wins (see `compactList`).
 */
export async function addDetectable(pathSuffix: string, igdbId: number, name: string): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Admins only.' }

  const suffix = cleanSubmittedSuffix(pathSuffix)
  if (!suffix) {
    return { success: false, error: 'Enter a path ending like "tunic/tunic.exe": up to three parts, ending in .exe, no drive or user folder.' }
  }
  if (!Number.isInteger(igdbId) || igdbId <= 0) return { success: false, error: 'Pick a game.' }

  const sb = createAdminClient()
  const { error } = await (sb.from('detectable_games') as any).upsert({
    path_suffix: suffix,
    source: 'admin',
    name,
    igdb_id: igdbId,
    approved_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'source,path_suffix' })
  if (error) return { success: false, error: error.message }

  // Approving something once dismissed brings it back for good.
  await (sb.from('detectable_dismissed') as any).delete().eq('path_suffix', suffix)

  revalidatePath('/admin/exe-links')
  return { success: true }
}

/** Take a queue item off the queue: "not a game", or not worth listing. */
export async function dismissQueueItem(key: string): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Admins only.' }

  const sb = createAdminClient()
  const { error } = await (sb.from('detectable_dismissed') as any).upsert({
    path_suffix: key.trim().toLowerCase(),
    dismissed_by: user.id,
  }, { onConflict: 'path_suffix' })
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/exe-links')
  return { success: true }
}

/** Bound to a plain `<form action>`. Admin rows only — Discord rows come and go with the weekly import. */
export async function removeDetectable(id: number): Promise<void> {
  const user = await requireAdmin()
  if (!user) {
    console.error('removeDetectable: admins only')
    return
  }

  const sb = createAdminClient()
  const { error } = await (sb.from('detectable_games') as any)
    .delete()
    .eq('id', id)
    .eq('source', 'admin')
  if (error) {
    console.error(`removeDetectable(${id}): ${error.message}`)
    return
  }
  revalidatePath('/admin/exe-links')
}
