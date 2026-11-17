import { unstable_cache } from 'next/cache'
import { getUpcomingEvents } from '@/lib/igdb'

// Upcoming IGDB gaming events for the dashboard's "Coming up" card. Cached for
// an hour so the dashboard doesn't hit the API on every load (the igdbQuery
// POST isn't cached by Next automatically, and events change slowly). The key
// is versioned: bump it when the event shape changes, so stale payloads
// missing new fields are discarded rather than served.
export const getCachedEvents = unstable_cache(() => getUpcomingEvents(5), ['upcoming-events-v5'], { revalidate: 3600 })
