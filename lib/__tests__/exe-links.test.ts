import { describe, it, expect } from 'vitest'
import { pickLegacyLink, planExeLinkWrite } from '../exe-links'

const row = (id: string, game_id: string, path_suffix: string | null, created_at = '2026-11-01T00:00:00Z') =>
  ({ id, game_id, exe_name: 'wow.exe', path_suffix, created_at })

describe('planExeLinkWrite', () => {
  const forever = row('l1', 'forever', '_forever_/wow.exe')

  it('gives a second game sharing the exe its own link, by folder', () => {
    expect(planExeLinkWrite([forever], { gameId: 'retail', pathSuffix: '_retail_/wow.exe' })).toEqual({ kind: 'insert' })
  })

  it('updates the link for the same folder', () => {
    expect(planExeLinkWrite([forever], { gameId: 'forever2', pathSuffix: '_forever_/wow.exe' }))
      .toEqual({ kind: 'update', id: 'l1', set: { game_id: 'forever2' } })
  })

  it('adds the folder to an old folder-less link for the same game', () => {
    expect(planExeLinkWrite([row('l0', 'forever', null)], { gameId: 'forever', pathSuffix: '_forever_/wow.exe' }))
      .toEqual({ kind: 'update', id: 'l0', set: { game_id: 'forever', path_suffix: '_forever_/wow.exe' } })
  })

  it('without a folder, repoints a single link as it always did', () => {
    expect(planExeLinkWrite([forever], { gameId: 'other', pathSuffix: null }))
      .toEqual({ kind: 'update', id: 'l1', set: { game_id: 'other' } })
  })

  it('without a folder and several links, uses the folder-less one or adds one', () => {
    const retail = row('l2', 'retail', '_retail_/wow.exe')
    expect(planExeLinkWrite([forever, retail, row('l0', 'x', null)], { gameId: 'y', pathSuffix: null }))
      .toEqual({ kind: 'update', id: 'l0', set: { game_id: 'y' } })
    expect(planExeLinkWrite([forever, retail], { gameId: 'y', pathSuffix: null })).toEqual({ kind: 'insert' })
  })

  it('adds a first link', () => {
    expect(planExeLinkWrite([], { gameId: 'g', pathSuffix: null })).toEqual({ kind: 'insert' })
    expect(planExeLinkWrite([], { gameId: 'g', pathSuffix: 'a/b.exe' })).toEqual({ kind: 'insert' })
  })
})

describe('pickLegacyLink', () => {
  it('prefers the folder-less link, else the newest', () => {
    const a = row('a', 'forever', '_forever_/wow.exe', '2026-11-01T00:00:00Z')
    const b = row('b', 'retail', '_retail_/wow.exe', '2026-11-10T00:00:00Z')
    expect(pickLegacyLink([a, b])?.id).toBe('b')
    expect(pickLegacyLink([a, b, row('c', 'x', null, '2026-01-01T00:00:00Z')])?.id).toBe('c')
    expect(pickLegacyLink([])).toBeUndefined()
  })
})
