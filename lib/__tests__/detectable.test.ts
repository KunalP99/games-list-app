import { describe, it, expect } from 'vitest'
import {
  parseDiscordList, sanityCheck, compactList, cleanSubmittedSuffix, uniqueByBasename, normaliseSuffix, isCovered,
  MIN_IMPORT_ROWS,
} from '../detectable'

// Cut from the real list (2026-11-03), trimmed to the fields the parser reads.
const TUNIC = {
  id: '1129504770533634149', name: 'TUNIC',
  executables: [{ is_launcher: false, name: 'tunic/tunic.exe', os: 'win32' }],
  third_party_skus: [{ distributor: 'xbox', id: '9NLRT31Z4RWM' }, { distributor: 'steam', id: '553420' }],
}
const HADES = {
  id: '1402418342127472751', name: 'Hades',
  executables: [{ is_launcher: false, name: 'hades.exe', os: 'win32' }],
  third_party_skus: [{ distributor: 'steam', id: '1145360' }],
}
const HADES_II = {
  id: '1237101681695522867', name: 'Hades II',
  executables: [{ is_launcher: false, name: 'ship/hades2.exe', os: 'win32' }],
  third_party_skus: [{ distributor: 'steam', id: '1145350' }],
}
const WOW = {
  id: '356875762940379136', name: 'World of Warcraft',
  executables: [
    { is_launcher: false, name: '_retail_/world of warcraft.app', os: 'darwin' },
    { is_launcher: false, name: '_retail_/wow.exe', os: 'win32' },
    { is_launcher: false, name: '_ptr_/wow.exe', os: 'win32' },
  ],
  third_party_skus: [{ distributor: 'battlenet', id: null }],
}
const STAR_CONFLICT = {
  id: '451546138999390208', name: 'Star Conflict',
  executables: [{ is_launcher: false, name: 'star conflict/game.exe', os: 'win32' }],
  third_party_skus: [{ distributor: 'steam', id: '212070' }],
}
const MIRROR = {
  id: '1', name: 'Mirror',
  executables: [{ is_launcher: false, name: 'mirror/game.exe', os: 'win32' }],
}
const HL2_MOD = {
  id: '2', name: 'Some Source Mod',
  executables: [
    { is_launcher: false, name: '>hl2.exe', os: 'win32' },
    { is_launcher: false, name: 'hl2.exe', os: 'win32', arguments: '-game somemod' },
    { is_launcher: true, name: 'somemod/launcher.exe', os: 'win32' },
  ],
}

const rowsOf = (json: unknown) => {
  const r = parseDiscordList(json)
  if (!r.ok) throw new Error(r.reason)
  return r
}

describe('parseDiscordList', () => {
  it('keeps Windows path endings with their Steam id', () => {
    const { rows } = rowsOf([TUNIC])
    expect(rows).toEqual([{ path_suffix: 'tunic/tunic.exe', name: 'TUNIC', steam_appid: 553420, discord_id: TUNIC.id }])
  })

  it('tells Hades and Hades II apart', () => {
    const { rows } = rowsOf([HADES, HADES_II])
    expect(rows.map(r => [r.path_suffix, r.name])).toEqual([['hades.exe', 'Hades'], ['ship/hades2.exe', 'Hades II']])
  })

  it('keeps every Windows ending of one game and drops other platforms', () => {
    const { rows } = rowsOf([WOW])
    expect(rows.map(r => r.path_suffix)).toEqual(['_retail_/wow.exe', '_ptr_/wow.exe'])
    expect(rows[0].steam_appid).toBeNull()
  })

  it('separates two games that both ship game.exe by their folders', () => {
    const { rows } = rowsOf([STAR_CONFLICT, MIRROR])
    expect(rows.map(r => r.path_suffix)).toEqual(['star conflict/game.exe', 'mirror/game.exe'])
  })

  it('drops an ending two different games claim, rather than guessing', () => {
    const clash = { ...MIRROR, id: '3', name: 'Other', executables: [{ is_launcher: false, name: 'tunic/tunic.exe', os: 'win32' }] }
    const result = rowsOf([TUNIC, clash, { ...TUNIC, id: '4', name: 'Third' }])
    expect(result.rows).toEqual([])
    expect(result.skipped).toBeGreaterThan(0)
  })

  it('skips shared engine exes, argument-bound rows and launchers', () => {
    const { rows, skipped } = rowsOf([HL2_MOD])
    expect(rows).toEqual([])
    expect(skipped).toBe(2) // the launcher is filtered, not counted as skipped
  })

  it('normalises case and backslashes', () => {
    const odd = { ...MIRROR, executables: [{ is_launcher: false, name: 'Some Game\\Bin\\Game.EXE', os: 'win32' }] }
    expect(rowsOf([odd]).rows[0].path_suffix).toBe('some game/bin/game.exe')
  })

  it('ignores a non-numeric Steam id', () => {
    const bad = { ...TUNIC, third_party_skus: [{ distributor: 'steam', id: 'abc' }] }
    expect(rowsOf([bad]).rows[0].steam_appid).toBeNull()
  })

  it('rejects the whole list when its shape is wrong', () => {
    expect(parseDiscordList({ applications: [] }).ok).toBe(false)
    expect(parseDiscordList([TUNIC, { name: 'no id' }]).ok).toBe(false)
    expect(parseDiscordList([{ ...TUNIC, executables: 'tunic.exe' }]).ok).toBe(false)
  })

  it('counts every entry it saw, including ones with nothing for Windows', () => {
    expect(rowsOf([TUNIC, { id: '9', name: 'Mac only', executables: [] }]).entriesSeen).toBe(2)
  })
})

describe('sanityCheck', () => {
  it('refuses a list that is suspiciously small', () => {
    expect(sanityCheck(MIN_IMPORT_ROWS - 1, null).ok).toBe(false)
    expect(sanityCheck(MIN_IMPORT_ROWS, null).ok).toBe(true)
  })

  it('refuses a list that shrank by more than a fifth since the last import', () => {
    expect(sanityCheck(7999, 10000).ok).toBe(false)
    expect(sanityCheck(8000, 10000).ok).toBe(true)
  })
})

describe('compactList', () => {
  it('lets an admin row replace a Discord row with the same ending', () => {
    expect(compactList([
      { id: 1, path_suffix: 'b/game.exe', source: 'discord' },
      { id: 2, path_suffix: 'a/game.exe', source: 'discord' },
      { id: 3, path_suffix: 'b/game.exe', source: 'admin' },
    ])).toEqual([['a/game.exe', 2], ['b/game.exe', 3]])
  })

  it('keeps the admin row whichever order they arrive in', () => {
    expect(compactList([
      { id: 3, path_suffix: 'b/game.exe', source: 'admin' },
      { id: 1, path_suffix: 'b/game.exe', source: 'discord' },
    ])).toEqual([['b/game.exe', 3]])
  })
})

describe('cleanSubmittedSuffix', () => {
  it('accepts a short ending and normalises it', () => {
    expect(cleanSubmittedSuffix('Tunic\\Tunic.exe')).toBe('tunic/tunic.exe')
    expect(cleanSubmittedSuffix('binaries/win64/game.exe')).toBe('binaries/win64/game.exe')
  })

  it('refuses anything that could carry a drive, a user folder or too much path', () => {
    expect(cleanSubmittedSuffix('c:/games/x.exe')).toBeNull()
    expect(cleanSubmittedSuffix('users/kunal/x.exe')).toBeNull()
    expect(cleanSubmittedSuffix('a/b/c/d.exe')).toBeNull()
    expect(cleanSubmittedSuffix('../x.exe')).toBeNull()
    expect(cleanSubmittedSuffix('readme.txt')).toBeNull()
    expect(cleanSubmittedSuffix(42)).toBeNull()
  })
})

describe('uniqueByBasename', () => {
  const row = (path_suffix: string, discord_id: string | null, source = 'discord', igdb_id: number | null = null) =>
    ({ path_suffix, discord_id, source, igdb_id })

  it('finds the game for a bare exe name', () => {
    expect(uniqueByBasename([row('tunic/tunic.exe', '1')], 'TUNIC.exe')?.path_suffix).toBe('tunic/tunic.exe')
  })

  it('treats several endings of the same game as one answer', () => {
    expect(uniqueByBasename([row('_retail_/wow.exe', '1'), row('_ptr_/wow.exe', '1')], 'wow.exe')).not.toBeNull()
  })

  it('refuses when the name belongs to more than one game', () => {
    expect(uniqueByBasename([row('star conflict/game.exe', '1'), row('mirror/game.exe', '2')], 'game.exe')).toBeNull()
  })

  it('prefers the admin row', () => {
    const hit = uniqueByBasename([row('x/a.exe', null, 'admin', 5), row('a.exe', null, 'admin', 5)], 'a.exe')
    expect(hit?.source).toBe('admin')
  })

  it('does not match a different exe that merely ends the same way', () => {
    expect(uniqueByBasename([row('ship/hades2.exe', '1')], 'hades.exe')).toBeNull()
  })
})

describe('isCovered', () => {
  const listed = new Set(['tunic/tunic.exe', 'hades.exe'])

  it('is covered when the submitted ending, or any tail of it, is listed', () => {
    expect(isCovered('tunic/tunic.exe', listed)).toBe(true)
    expect(isCovered('games/tunic/tunic.exe', listed)).toBe(true)
    expect(isCovered('hades/hades.exe', listed)).toBe(true)
  })

  it('is not covered by a different folder or a lookalike name', () => {
    expect(isCovered('other/tunic.exe', listed)).toBe(false)
    expect(isCovered('ship/hades2.exe', listed)).toBe(false)
  })
})

describe('normaliseSuffix', () => {
  it('trims stray slashes and spaces', () => {
    expect(normaliseSuffix(' /Tunic//Tunic.exe/ ')).toBe('tunic/tunic.exe')
  })
})
