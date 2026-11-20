import { describe, it, expect } from 'vitest'
import {
  normaliseSerial, cleanEmulatorTitle, emulatorTitleKey, parseEmulatorRequest, isEmulatorPlatform,
} from '../emulators'

describe('normaliseSerial', () => {
  it.each([
    ['SLUS-20946', 'SLUS20946'],
    ['SLUS_209.46', 'SLUS20946'],
    ['slus 20946', 'SLUS20946'],
    ['BLUS30443', 'BLUS30443'],
    ['ULUS10041', 'ULUS10041'],
    ['PCSE00000', 'PCSE00000'],
    ['CUSA00900', 'CUSA00900'],
    ['NPUB31234', 'NPUB31234'],
  ])('%s → %s', (raw, want) => expect(normaliseSerial(raw)).toBe(want))

  it.each([['SLUS-2094'], ['S-20946'], ['hello'], [''], [42], [null]])('rejects %s', raw =>
    expect(normaliseSerial(raw)).toBeNull())
})

describe('cleanEmulatorTitle', () => {
  it('drops region, disc and revision tags', () =>
    expect(cleanEmulatorTitle('Final Fantasy VII (USA) (Disc 1) (Rev 1)')).toBe('Final Fantasy VII'))
  it('drops a bracketed serial and good-dump marks', () =>
    expect(cleanEmulatorTitle('Shadow of the Colossus [SCUS-97472] [!]')).toBe('Shadow of the Colossus'))
  it('moves a trailing article to the front', () =>
    expect(cleanEmulatorTitle('Legend of Dragoon, The (USA)')).toBe('The Legend of Dragoon'))
  it('drops trademark marks', () =>
    expect(cleanEmulatorTitle('Gran Turismo™ 4')).toBe('Gran Turismo 4'))
  it('leaves a plain name alone', () =>
    expect(cleanEmulatorTitle('  Persona 4 Golden ')).toBe('Persona 4 Golden'))
})

describe('emulatorTitleKey', () => {
  it('prefers the serial', () => expect(emulatorTitleKey('SLUS20946', 'Anything')).toBe('serial:SLUS20946'))
  it('falls back to the cleaned name', () =>
    expect(emulatorTitleKey(null, 'Legend of Dragoon, The (USA)')).toBe('title:thelegendofdragoon'))
  it('is null with neither', () => {
    expect(emulatorTitleKey(null, null)).toBeNull()
    expect(emulatorTitleKey(null, '(USA)')).toBeNull()
  })
})

describe('parseEmulatorRequest', () => {
  it('accepts a PS2 game with a serial', () =>
    expect(parseEmulatorRequest({ platform: 8, serial: 'SLUS-20946', title: 'Ratchet & Clank' }))
      .toEqual({ platform: 8, serial: 'SLUS20946', title: 'Ratchet & Clank', key: 'serial:SLUS20946' }))
  it('accepts a title alone', () =>
    expect(parseEmulatorRequest({ platform: 38, title: 'Crisis Core' }))
      .toMatchObject({ serial: null, key: 'title:crisiscore' }))
  it('ignores a malformed serial rather than failing', () =>
    expect(parseEmulatorRequest({ platform: 7, serial: 'nope', title: 'Spyro the Dragon' }))
      .toMatchObject({ serial: null, key: 'title:spyrothedragon' }))
  it('refuses an unsupported platform', () =>
    expect(typeof parseEmulatorRequest({ platform: 6, title: 'Doom' })).toBe('string'))
  it('refuses nothing to go on', () =>
    expect(typeof parseEmulatorRequest({ platform: 8 })).toBe('string'))
  it('refuses a very long title', () =>
    expect(typeof parseEmulatorRequest({ platform: 8, title: 'x'.repeat(201) })).toBe('string'))
  it('refuses a non-object', () => expect(typeof parseEmulatorRequest('PS2')).toBe('string'))
})

describe('isEmulatorPlatform', () => {
  it('knows the PlayStation consoles only', () => {
    expect([7, 8, 9, 38, 46, 48].every(isEmulatorPlatform)).toBe(true)
    expect(isEmulatorPlatform(6)).toBe(false)
    expect(isEmulatorPlatform('8')).toBe(false)
  })
})
