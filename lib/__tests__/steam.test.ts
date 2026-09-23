import { describe, it, expect } from 'vitest'
import { steamReviewBadge, type SteamReviewSummary } from '../steam'
import { steamAppIdFrom } from '../igdb'

const summary = (over: Partial<SteamReviewSummary> = {}): SteamReviewSummary => ({
  appId: 413150,
  desc: 'Overwhelmingly Positive',
  totalPositive: 98,
  totalNegative: 2,
  totalReviews: 100,
  ...over,
})

describe('steamReviewBadge', () => {
  it('returns Steam\'s own wording with a rounded positive percentage', () => {
    const badge = steamReviewBadge(summary())
    expect(badge).toEqual({
      label: 'Overwhelmingly Positive',
      percent: 98,
      totalReviews: 100,
      tone: 'positive',
    })
  })

  it('rounds the percentage rather than truncating it', () => {
    // 2/3 positive = 66.67% -> 67, not 66.
    expect(steamReviewBadge(summary({ totalPositive: 2, totalNegative: 1, totalReviews: 3, desc: 'Mixed' }))).toBeNull()
    expect(steamReviewBadge(summary({ totalPositive: 20, totalNegative: 10, totalReviews: 30 }))?.percent).toBe(67)
  })

  it('buckets tone on Steam\'s published thresholds', () => {
    expect(steamReviewBadge(summary({ totalPositive: 70, totalReviews: 100 }))?.tone).toBe('positive')
    expect(steamReviewBadge(summary({ totalPositive: 69, totalReviews: 100 }))?.tone).toBe('mixed')
    expect(steamReviewBadge(summary({ totalPositive: 40, totalReviews: 100 }))?.tone).toBe('mixed')
    expect(steamReviewBadge(summary({ totalPositive: 39, totalReviews: 100 }))?.tone).toBe('negative')
  })

  it('shows nothing below 10 reviews, where a percentage is noise', () => {
    expect(steamReviewBadge(summary({ totalPositive: 9, totalNegative: 0, totalReviews: 9 }))).toBeNull()
    expect(steamReviewBadge(summary({ totalPositive: 10, totalNegative: 0, totalReviews: 10 }))).not.toBeNull()
  })

  it('shows nothing for an unknown app, which Steam reports as zero reviews', () => {
    // The live endpoint answers success:1 with "No user reviews" for a bogus id.
    expect(steamReviewBadge(summary({ desc: 'No user reviews', totalPositive: 0, totalNegative: 0, totalReviews: 0 }))).toBeNull()
  })

  it('shows nothing when the fetch failed', () => {
    expect(steamReviewBadge(null)).toBeNull()
  })
})

describe('steamAppIdFrom', () => {
  it('picks the Steam entry, not whichever external id comes first', () => {
    expect(steamAppIdFrom([
      { uid: '1234', external_game_source: 5 },   // GOG
      { uid: '413150', external_game_source: 1 }, // Steam
    ])).toBe(413150)
  })

  it('returns null for a game with no Steam release', () => {
    expect(steamAppIdFrom([{ uid: '99', external_game_source: 11 }])).toBeNull()
    expect(steamAppIdFrom([])).toBeNull()
    expect(steamAppIdFrom(undefined)).toBeNull()
  })

  it('ignores malformed uids rather than producing NaN', () => {
    expect(steamAppIdFrom([{ uid: 'not-a-number', external_game_source: 1 }])).toBeNull()
    expect(steamAppIdFrom([{ external_game_source: 1 }])).toBeNull()
    expect(steamAppIdFrom([
      { uid: 'bad', external_game_source: 1 },
      { uid: '413150', external_game_source: 1 },
    ])).toBe(413150)
  })
})
