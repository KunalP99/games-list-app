import { describe, it, expect } from 'vitest'
import { contentSecurityPolicy, makeNonce } from '@/lib/csp'

const directive = (csp: string, name: string) =>
  csp.split('; ').find(d => d.startsWith(`${name} `))?.slice(name.length + 1).split(' ') ?? []

describe('contentSecurityPolicy', () => {
  const prod = contentSecurityPolicy({ nonce: 'abc', supabaseUrl: 'https://xyz.supabase.co/', dev: false })
  const dev = contentSecurityPolicy({ nonce: 'abc', supabaseUrl: 'http://127.0.0.1:54321', dev: true })

  it('lets scripts run only with the nonce (no inline, no eval in production)', () => {
    const scripts = directive(prod, 'script-src')
    expect(scripts).toContain("'nonce-abc'")
    expect(scripts).toContain("'strict-dynamic'")
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
  })

  it('allows eval only in development (React error overlay)', () => {
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
  })

  it('connects to its own Supabase project only, http and websocket', () => {
    expect(directive(prod, 'connect-src')).toEqual(expect.arrayContaining(["'self'", 'https://xyz.supabase.co', 'wss://xyz.supabase.co']))
    expect(directive(dev, 'connect-src')).toEqual(expect.arrayContaining(['http://127.0.0.1:54321', 'ws://127.0.0.1:54321']))
  })

  it('frames YouTube and Turnstile, and is never framed itself', () => {
    expect(directive(prod, 'frame-src')).toEqual(expect.arrayContaining(['https://www.youtube.com', 'https://challenges.cloudflare.com']))
    expect(directive(prod, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(prod, 'object-src')).toEqual(["'none'"])
  })

  it('upgrades insecure requests in production only (local Supabase is plain http)', () => {
    expect(prod).toContain('upgrade-insecure-requests')
    expect(dev).not.toContain('upgrade-insecure-requests')
  })

  it('copes with a missing or malformed Supabase URL', () => {
    expect(directive(contentSecurityPolicy({ nonce: 'n', dev: false }), 'connect-src')).toEqual(["'self'", 'https://challenges.cloudflare.com'])
    expect(directive(contentSecurityPolicy({ nonce: 'n', supabaseUrl: 'not a url', dev: false }), 'connect-src')).toEqual(["'self'", 'https://challenges.cloudflare.com'])
  })
})

describe('makeNonce', () => {
  it('is fresh each time and base64', () => {
    const a = makeNonce(), b = makeNonce()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})
