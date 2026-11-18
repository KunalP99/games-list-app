// Escaping user text before it goes into a Supabase (PostgREST) filter.

/**
 * Escapes LIKE/ILIKE wildcards, so `.ilike(col, escapeLike(text))` matches the
 * text exactly (case-insensitively) — `Half_Life` matches only itself, not
 * `HalfXLife`. Backslash is Postgres' default LIKE escape character.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, c => `\\${c}`)
}

/**
 * A PostgREST `.or()` filter matching `text` anywhere in any of `columns`,
 * case-insensitively.
 *
 * `.or()` takes a raw filter string, so user text dropped in unquoted breaks it
 * — a comma ends the condition ("Warhammer 40,000" was a parse error) and
 * parentheses or dots can add conditions of their own. The value is therefore
 * double-quoted, with `\` and `"` escaped inside the quotes (PostgREST's rule),
 * on top of the LIKE escaping, so the search is always for the literal text.
 */
export function ilikeAnyFilter(columns: string[], text: string): string {
  const pattern = `%${escapeLike(text)}%`
  const quoted = `"${pattern.replace(/[\\"]/g, c => `\\${c}`)}"`
  return columns.map(col => `${col}.ilike.${quoted}`).join(',')
}
