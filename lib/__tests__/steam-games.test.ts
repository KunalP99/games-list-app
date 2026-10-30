import { describe, it, expect } from 'vitest'
import { fromCache, isStale } from '../steam-games'

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-10-30T12:00:00Z')
const ago = (days: number) => new Date(now - days * DAY).toISOString()

describe('fromCache', () => {
  it('uses a known game forever', () => {
    // A Steam app does not turn into a different game, so age is irrelevant.
    expect(fromCache({ igdb_id: 186725, name: 'Vampire Survivors', checked_at: ago(900) }, now))
      .toEqual({ kind: 'game', igdbId: 186725, name: 'Vampire Survivors' })
  })

  it('trusts a recent "not a game"', () => {
    // Blender, Wallpaper Engine and the Steamworks redistributables all land
    // here — that is what stops them being asked about.
    expect(fromCache({ igdb_id: null, name: null, checked_at: ago(3) }, now))
      .toEqual({ kind: 'notAGame' })
  })

  it('re-checks a stale "not a game" instead of trusting it forever', () => {
    // IGDB adds titles constantly. A game missing at release would otherwise
    // be written off permanently, with nothing to ever correct it.
    expect(fromCache({ igdb_id: null, name: null, checked_at: ago(60) }, now)).toBeNull()
  })

  it('looks up anything it has never seen', () => {
    expect(fromCache(null, now)).toBeNull()
  })

  it('re-checks a negative with no timestamp or a corrupt one', () => {
    expect(fromCache({ igdb_id: null, name: null, checked_at: null }, now)).toBeNull()
    expect(fromCache({ igdb_id: null, name: null, checked_at: 'not a date' }, now)).toBeNull()
  })

  it('still returns a game whose name was never recorded', () => {
    // The id is what matters; a blank name should not send it back to IGDB.
    expect(fromCache({ igdb_id: 3225, name: null, checked_at: ago(900) }, now))
      .toEqual({ kind: 'game', igdbId: 3225, name: '' })
  })
})

describe('isStale', () => {
  it('is false just inside the window and true just outside', () => {
    expect(isStale(ago(29), now)).toBe(false)
    expect(isStale(ago(31), now)).toBe(true)
  })

  it('treats a missing or unparseable timestamp as stale', () => {
    expect(isStale(null, now)).toBe(true)
    expect(isStale(undefined, now)).toBe(true)
    expect(isStale('', now)).toBe(true)
  })
})
