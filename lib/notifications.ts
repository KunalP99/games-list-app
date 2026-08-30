import type { Notification } from './types'

// How many notifications the bell loads per page (initial render + each "Load more").
export const NOTIFICATIONS_PAGE_SIZE = 8

// A notification plus its linked game's portrait cover (embedded via game_id).
export type NotificationWithGame = Notification & { game: { cover_image_url: string | null } | null }
