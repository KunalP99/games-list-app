import { describe, it, expect } from 'vitest'
import { editionFrom, featuresFor, brandFor, wheelOnFor, statusForEdition, PLACEHOLDER_BRAND_NAME } from '../edition'

describe('editionFrom', () => {
  it('is friends unless explicitly public', () => {
    expect(editionFrom(undefined)).toBe('friends')
    expect(editionFrom('')).toBe('friends')
    expect(editionFrom('friends')).toBe('friends')
    expect(editionFrom('Public')).toBe('friends')
    expect(editionFrom('nonsense')).toBe('friends')
    expect(editionFrom('public')).toBe('public')
  })
})

describe('featuresFor', () => {
  it('has the wheel and Ambient in the friends edition only', () => {
    expect(featuresFor('friends').wheel).toBe(true)
    expect(featuresFor('public').wheel).toBe(false)
    expect(featuresFor('friends').ambient).toBe(true)
    expect(featuresFor('public').ambient).toBe(false)
  })

  it('lists Ticket History in the nav for friends only', () => {
    expect(featuresFor('friends').ticketHistoryNav).toBe(true)
    expect(featuresFor('public').ticketHistoryNav).toBe(false)
  })

  it('has secure sign-up in the public edition only', () => {
    expect(featuresFor('friends').secureAuth).toBe(false)
    expect(featuresFor('public').secureAuth).toBe(true)
  })

  it('has verified completion rewards in the public edition only', () => {
    expect(featuresFor('friends').verifiedRewards).toBe(false)
    expect(featuresFor('public').verifiedRewards).toBe(true)
  })

  it('shares the ticket ledger in the friends edition only', () => {
    expect(featuresFor('friends').sharedTicketLedger).toBe(true)
    expect(featuresFor('public').sharedTicketLedger).toBe(false)
  })
})

describe('brandFor', () => {
  it('keeps GamesList for the friends edition, whatever the brand setting says', () => {
    expect(brandFor('friends', 'Something Else').name).toBe('GamesList')
    expect(brandFor('friends', undefined).tagline).toContain('Spin the wheel')
  })

  it('uses the configured name for the public edition, else a placeholder', () => {
    expect(brandFor('public', 'Playpath').name).toBe('Playpath')
    expect(brandFor('public', undefined).name).toBe(PLACEHOLDER_BRAND_NAME)
    expect(brandFor('public', '   ').name).toBe(PLACEHOLDER_BRAND_NAME)
    expect(brandFor('public', undefined).tagline).not.toMatch(/wheel/i)
  })
})

describe('wheelOnFor', () => {
  it('follows the user setting in the friends edition (on unless set false)', () => {
    expect(wheelOnFor('friends', { wheel_enabled: true })).toBe(true)
    expect(wheelOnFor('friends', { wheel_enabled: null })).toBe(true)
    expect(wheelOnFor('friends', null)).toBe(true)
    expect(wheelOnFor('friends', { wheel_enabled: false })).toBe(false)
  })

  it('is always off in the public edition', () => {
    expect(wheelOnFor('public', { wheel_enabled: true })).toBe(false)
    expect(wheelOnFor('public', null)).toBe(false)
  })
})

describe('statusForEdition', () => {
  it('turns Ambient into Playing in the public edition only', () => {
    expect(statusForEdition('public', 'ambient')).toBe('playing')
    expect(statusForEdition('friends', 'ambient')).toBe('ambient')
  })

  it('leaves every other status alone', () => {
    for (const s of ['playing', 'completed', 'backlog', 'dnf']) {
      expect(statusForEdition('public', s)).toBe(s)
      expect(statusForEdition('friends', s)).toBe(s)
    }
  })
})
