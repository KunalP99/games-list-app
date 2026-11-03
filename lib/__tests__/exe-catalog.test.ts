import { describe, expect, it } from 'vitest'
import { resolveExeCandidate, type ExeCatalogRow } from '../exe-catalog'

function row(overrides: Partial<ExeCatalogRow> = {}): ExeCatalogRow {
  return { id: 'row-1', igdb_id: null, title: 'Some Game', folder_hint: '', ...overrides }
}

describe('resolveExeCandidate', () => {
  it('returns null when there are no rows for the exe name', () => {
    expect(resolveExeCandidate([], null)).toBeNull()
    expect(resolveExeCandidate([], 'c:\\games\\anything\\thing.exe')).toBeNull()
  })

  it('trusts a single row regardless of install path', () => {
    const only = row({ id: 'only' })
    expect(resolveExeCandidate([only], null)).toBe(only)
    expect(resolveExeCandidate([only], 'c:\\anywhere\\thing.exe')).toBe(only)
  })

  it('refuses to guess between two rows with no install path to disambiguate them', () => {
    // The Riot.exe shape: an unrelated launcher and an unrelated game share
    // an exe name, and nothing narrows it down.
    const launcher = row({ id: 'launcher', title: 'Riot Games Launcher', folder_hint: 'riot games' })
    const game = row({ id: 'game', title: 'Riot', folder_hint: 'riot' })
    expect(resolveExeCandidate([launcher, game], null)).toBeNull()
  })

  it('picks the one row whose folder hint the install path actually contains', () => {
    const launcher = row({ id: 'launcher', title: 'Riot Games Launcher', folder_hint: 'riot games' })
    const game = row({ id: 'game', title: 'Riot', folder_hint: 'some indie studio' })
    const path = 'c:\\program files\\riot games\\riot client\\riotclientservices\\riot.exe'
    expect(resolveExeCandidate([launcher, game], path)).toBe(launcher)
  })

  it('refuses even with a path, when one hint is a substring of the other and both match', () => {
    // A loose hint ("riot") is itself a substring of the real launcher's
    // path ("riot games\...") — exactly the trap a lazily-chosen hint would
    // fall into, and exactly why this stays conservative rather than
    // preferring the "more specific" match.
    const launcher = row({ id: 'launcher', title: 'Riot Games Launcher', folder_hint: 'riot games' })
    const game = row({ id: 'game', title: 'Riot', folder_hint: 'riot' })
    const path = 'c:\\program files\\riot games\\riot client\\riotclientservices\\riot.exe'
    expect(resolveExeCandidate([launcher, game], path)).toBeNull()
  })

  it('refuses when the install path matches more than one hint at once', () => {
    const a = row({ id: 'a', folder_hint: 'games' })
    const b = row({ id: 'b', folder_hint: 'games\\sub' })
    expect(resolveExeCandidate([a, b], 'c:\\games\\sub\\thing.exe')).toBeNull()
  })

  it('refuses when the install path matches none of the hints', () => {
    const a = row({ id: 'a', folder_hint: 'steamapps' })
    const b = row({ id: 'b', folder_hint: 'epic games' })
    expect(resolveExeCandidate([a, b], 'c:\\somewhere\\else\\thing.exe')).toBeNull()
  })

  it('is case-insensitive about the folder hint match', () => {
    const only = row({ id: 'only', folder_hint: 'Steam Games' })
    const other = row({ id: 'other', folder_hint: 'Other Place' })
    expect(resolveExeCandidate([only, other], 'C:\\STEAM GAMES\\thing.exe')).toBe(only)
  })
})
