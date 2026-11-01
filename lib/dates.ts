/**
 * Today's date as `YYYY-MM-DD`, UTC — the same format `completion_date` is
 * stored and compared in throughout the app, so this is also what a date
 * `<input>`'s `max` attribute should be set to.
 */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Whether an ISO date string (`YYYY-MM-DD`, including a year-precision
 * completion date normalised to `YYYY-01-01`) is after today.
 *
 * Plain string comparison works correctly here because ISO 8601 dates sort
 * lexicographically in calendar order.
 */
export function isFutureDate(dateStr: string): boolean {
  return dateStr > todayIsoDate()
}
