import { createClient } from '@/lib/supabase/server'
import WhatsNewModal from '@/components/layout/WhatsNewModal'

/**
 * Fetches the most recent changelog entry and hands it to the modal.
 *
 * Split out of the app layout for the same reason as the bell: this query was
 * awaited before anything rendered, on every navigation, for a modal that is
 * usually not shown at all.
 */
export default async function WhatsNewLoader() {
  const supabase = createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: latestChangelog } = await supabase
    .from('changelog_entries')
    .select('id, version, title, body')
    .gte('released_at', sevenDaysAgo)
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return <WhatsNewModal entry={latestChangelog ?? null} />
}
