// Tickets from play time, and the wheel game completion scale. Pure, so the
// rules are unit tested here; the database applies the counter itself in one
// locked step (add_hours_progress, db/hours-tickets.sql), with the same maths.
//
// * Games the wheel didn't pick: 1 ticket per 25 hours played. Tracked hours
//   fill one running counter per player as they're played (leftovers carry
//   to the next game); hours that were never tracked pay at completion,
//   rounded down per game (`typedHoursTickets`).
// * Games the wheel picked: nothing from their hours as they're played; on
//   completion they pay by length (`wheelCompletionTickets`).

/** Hours of play per ticket. */
export const HOURS_PER_TICKET = 25
/** The same, in minutes: what the counter holds. */
export const MINUTES_PER_TICKET = HOURS_PER_TICKET * 60
/** The public edition counts at most this many tracked hours a UK day. */
export const DAILY_HOURS_CAP_PUBLIC = 8

/**
 * Adds `minutes` of tracked play to a counter of `counter` minutes. With a
 * daily cap, only `capLeft` more minutes count today. Returns the tickets
 * paid, the counter after, and the minutes that counted.
 */
export function hoursTickets(counter: number, minutes: number, capLeft: number | null = null) {
  const add = Math.max(0, Math.min(minutes, capLeft == null ? Infinity : Math.max(0, capLeft)))
  const total = Math.max(0, counter) + add
  return { tickets: Math.floor(total / MINUTES_PER_TICKET), counter: total % MINUTES_PER_TICKET, counted: add }
}

/** Minutes still to play for the next ticket, from the counter. */
export function minutesToNextTicket(counter: number): number {
  return MINUTES_PER_TICKET - (Math.max(0, counter) % MINUTES_PER_TICKET)
}

/**
 * Tickets for completing a game the wheel picked, by its hours: under 20h 1,
 * 20–59h 2, 60–75h 3, then 1 more for every full 20 hours past 75 (95h 4,
 * 115h 5).
 */
export function wheelCompletionTickets(hours: number | null): number {
  const h = hours ?? 0
  if (h < 20) return 1
  if (h < 60) return 2
  if (h < 95) return 3
  return 3 + Math.floor((h - 75) / 20)
}

/**
 * Tickets at completion for the hours on a game that were never tracked
 * (typed in): 1 per 25, rounded down; the tracked hours paid as they were
 * played.
 */
export function typedHoursTickets(hoursPlayed: number | null, trackedHours: number): number {
  const typed = Math.max(0, (hoursPlayed ?? 0) - Math.max(0, trackedHours))
  return Math.floor(typed / HOURS_PER_TICKET + 1e-9)
}

/** "18 / 25h to your next ticket", from the counter (whole hours, rounded down). */
export function hoursToNextTicketLabel(counter: number): string {
  const played = Math.floor((Math.max(0, counter) % MINUTES_PER_TICKET) / 60)
  return `${played} / ${HOURS_PER_TICKET}h to your next ticket`
}
