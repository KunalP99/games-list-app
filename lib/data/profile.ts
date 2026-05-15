import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single() as { data: Profile | null; error: unknown }
  return data
})
