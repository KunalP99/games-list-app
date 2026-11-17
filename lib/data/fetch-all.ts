/**
 * Every row of a query, past PostgREST's 1,000-row cap. `query` must build a
 * fresh, ordered query each call (a stable order is what makes the pages line up).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await query().range(from, from + 999) as { data: T[] | null }
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
