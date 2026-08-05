import type { RawgSearchResult } from './rawg'

// Client-side fetch for one page of game search results. Used by every game
// search bar (game form, wheel builder, wheel "choose") so they all paginate
// the same way. `hasMore` tells the caller whether to keep loading on scroll.
export async function fetchGameSearchPage(
  query: string,
  page: number,
): Promise<{ results: RawgSearchResult[]; hasMore: boolean }> {
  try {
    const res = await fetch(`/api/rawg/search?q=${encodeURIComponent(query)}&page=${page}`)
    const data = await res.json()
    return {
      results: Array.isArray(data?.results) ? data.results : [],
      hasMore: Boolean(data?.hasMore),
    }
  } catch {
    return { results: [], hasMore: false }
  }
}
