import type { Database } from './database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Game = Database['public']['Tables']['games']['Row']
export type TicketTransaction = Database['public']['Tables']['ticket_transactions']['Row']
export type WheelSpin = Database['public']['Tables']['wheel_spins']['Row']
export type ChangelogEntry = Database['public']['Tables']['changelog_entries']['Row']

export type WheelTurn = Profile['wheel_turn']
export type GameStatus = Game['status']
export type TicketReason = Database['public']['Enums']['ticket_reason']

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
