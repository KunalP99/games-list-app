import { describe, it, expect } from 'vitest'
import { siteOriginFrom } from '../site-origin'

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null

describe('siteOriginFrom', () => {
  it('uses Vercel\'s production address in production, ignoring the request headers', () => {
    const env = { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'gameslist.example' }
    const h = headers({ origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', host: 'evil.example' })
    expect(siteOriginFrom(env, h)).toBe('https://gameslist.example')
  })

  it('keeps a scheme if Vercel gives one, without a trailing slash', () => {
    const env = { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'https://gameslist.example/' }
    expect(siteOriginFrom(env, headers({}))).toBe('https://gameslist.example')
  })

  it('falls back to the request outside production (local, previews)', () => {
    expect(siteOriginFrom({}, headers({ origin: 'http://localhost:3000' }))).toBe('http://localhost:3000')
    expect(siteOriginFrom({ VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'gameslist.example' },
      headers({ 'x-forwarded-host': 'preview-abc.vercel.app', 'x-forwarded-proto': 'https' }))).toBe('https://preview-abc.vercel.app')
    expect(siteOriginFrom({}, headers({ host: '127.0.0.1:3000' }))).toBe('http://127.0.0.1:3000')
  })

  it('falls back to the request in production if Vercel did not provide an address', () => {
    expect(siteOriginFrom({ VERCEL_ENV: 'production' }, headers({ origin: 'https://site.example' }))).toBe('https://site.example')
  })
})
