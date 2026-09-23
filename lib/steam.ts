// Steam review summaries for the game detail page.
//
// Steam's `appreviews` storefront endpoint needs no API key, so this adds no
// new credentials — the Steam app id it keys on comes free with the IGDB
// extras query (see `steamAppIdFrom` in lib/igdb.ts).
//
// Caveat worth remembering: this is an undocumented storefront endpoint, not
// part of the official Steam Web API. It's stable in practice and widely used,
// but nothing is guaranteed, so every failure path here returns null and the
// UI simply omits the row rather than surfacing an error.

const TIMEOUT_MS = 6000
// Review counts move slowly and the badge is decorative — a day-old figure is
// fine, and it keeps us from hammering an endpoint that owes us nothing.
const REVALIDATE_SECONDS = 86_400

export type SteamReviewSummary = {
  appId: number
  /** Steam's own wording, e.g. "Overwhelmingly Positive". */
  desc: string
  totalPositive: number
  totalNegative: number
  totalReviews: number
}

export type SteamReviewBadge = {
  label: string
  percent: number
  totalReviews: number
  /** Coarse bucket for colouring: Steam's own positive/mixed/negative split. */
  tone: 'positive' | 'mixed' | 'negative'
}

/**
 * Turn a raw summary into what the UI shows. Pure — all the arithmetic and
 * wording lives here so it can be tested without touching the network.
 * Returns null when there aren't enough reviews for a percentage to mean
 * anything (Steam itself shows no score below 10).
 */
export function steamReviewBadge(summary: SteamReviewSummary | null): SteamReviewBadge | null {
  if (!summary || summary.totalReviews < 10) return null
  const percent = Math.round((summary.totalPositive / summary.totalReviews) * 100)
  // Steam's published thresholds: 70%+ positive, 40–69% mixed, below 40% negative.
  const tone = percent >= 70 ? 'positive' : percent >= 40 ? 'mixed' : 'negative'
  return { label: summary.desc, percent, totalReviews: summary.totalReviews, tone }
}

type AppReviewsResponse = {
  success?: number
  query_summary?: {
    review_score_desc?: string
    total_positive?: number
    total_negative?: number
    total_reviews?: number
  }
}

/**
 * Fetch the aggregate review summary for a Steam app. Server-only: the
 * endpoint sets no CORS headers, and this must not run in the browser.
 * Returns null on any failure — a missing badge is always better than a
 * broken page.
 */
export async function getSteamReviewSummary(appId: number | null): Promise<SteamReviewSummary | null> {
  if (!appId) return null
  try {
    // num_per_page=0 asks for the summary only, not the review bodies.
    const res = await fetch(
      `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: REVALIDATE_SECONDS } },
    )
    if (!res.ok) return null
    const data = await res.json() as AppReviewsResponse
    const q = data.query_summary
    if (data.success !== 1 || !q?.review_score_desc || q.total_reviews == null) return null
    return {
      appId,
      desc: q.review_score_desc,
      totalPositive: q.total_positive ?? 0,
      totalNegative: q.total_negative ?? 0,
      totalReviews: q.total_reviews,
    }
  } catch {
    return null
  }
}
