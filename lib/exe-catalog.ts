// Pure resolution logic for `global_exe_links` lookups — kept separate from
// the route handler (app/api/agent/identify) per the usual split, since this
// is the exact rule that keeps a shared exe name (an unrelated launcher and
// an unrelated game, say) from being guessed between.

export type ExeCatalogRow = {
  id: string
  igdb_id: number | null
  title: string
  /** '' means "no hint" — the common case. */
  folder_hint: string
}

/**
 * Pick the one row a running program's install path actually means, or null
 * if that's not possible to say.
 *
 * A single row for the exe name is unambiguous regardless of path — most
 * exes in the catalog only ever map to one title. More than one row is only
 * ever resolved when the install path narrows it to exactly one row's
 * `folder_hint`; zero or multiple matches both mean "don't know", since
 * guessing between two different games sharing an exe name is worse than
 * leaving it unidentified.
 */
export function resolveExeCandidate(rows: ExeCatalogRow[], installPath: string | null): ExeCatalogRow | null {
  if (rows.length === 1) return rows[0]
  if (rows.length === 0) return null

  const path = installPath ? installPath.toLowerCase() : ''
  if (!path) return null

  const hits = rows.filter(r => r.folder_hint && path.includes(r.folder_hint.toLowerCase()))
  return hits.length === 1 ? hits[0] : null
}
