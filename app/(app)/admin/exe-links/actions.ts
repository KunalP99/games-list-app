'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normaliseExeName } from '@/lib/agent-session'

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

/** Add or replace a global exe -> game link, picked from a real search result. */
export async function addGlobalExeLink(
  exeName: string,
  igdbId: number,
  title: string,
  coverImageUrl: string | null,
): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Admins only.' }

  const normalised = normaliseExeName(exeName)
  if (!normalised) return { success: false, error: 'Enter an executable name.' }

  const sb = createAdminClient()
  const { error } = await (sb.from('global_exe_links') as any).upsert({
    exe_name: normalised,
    igdb_id: igdbId,
    title,
    cover_image_url: coverImageUrl,
    created_by: user.id,
  }, { onConflict: 'exe_name' })

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/exe-links')
  return { success: true }
}

/**
 * Promote something people have linked on their own libraries into the
 * global list. Bound directly to a plain `<form action>` on the review
 * queue, so (unlike `addGlobalExeLink`) this returns nothing for the UI to
 * read — a failure here is rare enough, and low-stakes enough, that logging
 * it server-side is enough.
 */
export async function promoteExeLink(exeName: string, igdbId: number, title: string): Promise<void> {
  const result = await addGlobalExeLink(exeName, igdbId, title, null)
  if (!result.success) console.error(`promoteExeLink(${exeName}): ${result.error}`)
}

/** Bound to a plain `<form action>` on the global-links list — see `promoteExeLink`. */
export async function removeGlobalExeLink(exeName: string): Promise<void> {
  const user = await requireAdmin()
  if (!user) {
    console.error('removeGlobalExeLink: admins only')
    return
  }

  const sb = createAdminClient()
  const { error } = await (sb.from('global_exe_links') as any)
    .delete()
    .eq('exe_name', normaliseExeName(exeName))

  if (error) {
    console.error(`removeGlobalExeLink(${exeName}): ${error.message}`)
    return
  }
  revalidatePath('/admin/exe-links')
}
