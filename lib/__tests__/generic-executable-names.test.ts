import { describe, it, expect } from 'vitest'
import { isGenericExecutableName } from '../generic-executable-names'

describe('isGenericExecutableName', () => {
  it('flags bare generic names', () => {
    expect(isGenericExecutableName('game.exe')).toBe(true)
    expect(isGenericExecutableName('Launch.exe')).toBe(true)
  })

  it('flags installer-shaped names', () => {
    expect(isGenericExecutableName('UnrelatedGame_Setup.exe')).toBe(true)
    expect(isGenericExecutableName('vcredist_x64.exe')).toBe(true)
  })

  it('does not flag a distinctive real game exe', () => {
    expect(isGenericExecutableName('starcitizen.exe')).toBe(false)
    expect(isGenericExecutableName('DeadSpace.exe')).toBe(false)
  })

  it('is case-insensitive and tolerant of a missing .exe', () => {
    expect(isGenericExecutableName('GAME')).toBe(true)
  })

  it('is false for an empty name', () => {
    expect(isGenericExecutableName('')).toBe(false)
    expect(isGenericExecutableName('   ')).toBe(false)
  })
})
