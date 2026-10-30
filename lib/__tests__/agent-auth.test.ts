import { describe, it, expect } from 'vitest'
import { bearerFrom, hashToken, generateDeviceToken, TOKEN_PREFIX, authenticateDevice } from '../agent-auth'

describe('bearerFrom', () => {
  it('reads a bearer token, case-insensitively', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123')
    expect(bearerFrom('bearer abc123')).toBe('abc123')
    expect(bearerFrom('  Bearer   abc123  ')).toBe('abc123')
  })

  it('rejects everything else, including a missing header', () => {
    // The cron routes' guard is fail-open when its secret is unset; this must
    // never be, because the agent is an untrusted client.
    expect(bearerFrom(null)).toBeNull()
    expect(bearerFrom(undefined)).toBeNull()
    expect(bearerFrom('')).toBeNull()
    expect(bearerFrom('Bearer')).toBeNull()
    expect(bearerFrom('Bearer   ')).toBeNull()
    expect(bearerFrom('Basic abc123')).toBeNull()
    expect(bearerFrom('abc123')).toBeNull()
  })
})

describe('hashToken', () => {
  it('is stable and 64 hex characters', () => {
    const h = hashToken('glk_example')
    expect(h).toHaveLength(64)
    expect(h).toBe(hashToken('glk_example'))
    expect(h).toBe(hashToken('  glk_example  '))
  })

  it('differs for different tokens, and never returns the token itself', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'))
    expect(hashToken('glk_secret')).not.toContain('glk_secret')
  })
})

describe('generateDeviceToken', () => {
  it('is prefixed, long, and unique per call', () => {
    const a = generateDeviceToken()
    const b = generateDeviceToken()
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true)
    expect(a.length).toBeGreaterThan(30)
    expect(a).not.toBe(b)
  })
})

describe('authenticateDevice', () => {
  const stub = (row: unknown, error: unknown = null) => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => {
            lastHash = value
            return { data: row, error }
          },
        }),
      }),
    }),
  })
  let lastHash = ''

  it('resolves a valid token to its owner', async () => {
    const sb = stub({ id: 'device-1', user_id: 'user-1' })
    await expect(authenticateDevice(sb, 'Bearer glk_good')).resolves.toEqual({
      userId: 'user-1', deviceId: 'device-1',
    })
  })

  it('looks the token up by hash, never by the raw value', async () => {
    const sb = stub({ id: 'device-1', user_id: 'user-1' })
    await authenticateDevice(sb, 'Bearer glk_good')
    expect(lastHash).toBe(hashToken('glk_good'))
    expect(lastHash).not.toContain('glk_good')
  })

  it('returns null for an unknown token, an error, or no header', async () => {
    await expect(authenticateDevice(stub(null), 'Bearer glk_nope')).resolves.toBeNull()
    await expect(authenticateDevice(stub(null, { message: 'boom' }), 'Bearer x')).resolves.toBeNull()
    await expect(authenticateDevice(stub({ id: 'd', user_id: 'u' }), null)).resolves.toBeNull()
  })
})
