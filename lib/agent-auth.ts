// Device-token auth for the desktop agent's API routes.
//
// The agent is not a browser: it has no Supabase session and no cookies. It
// presents a long-lived token issued from Settings, which is stored only as a
// sha256 hash — a leaked database row therefore cannot be replayed as a token.
import { createHash, randomBytes } from 'crypto'

/** Tokens are prefixed so they're recognisable in logs and paste boxes. */
export const TOKEN_PREFIX = 'glk_'

export function generateDeviceToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex')
}

/**
 * Pull the token out of an Authorization header.
 *
 * Deliberately strict about the absence of a token: unlike the cron routes'
 * `if (secret && ...)` guard, which is fail-open and would expose everything
 * if the env var went missing, a missing or malformed header here is always
 * a rejection.
 */
export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null
  const trimmed = header.trim()
  const prefix = 'bearer '
  if (trimmed.toLowerCase().startsWith(prefix)) {
    const token = trimmed.slice(prefix.length).trim()
    return token.length > 0 ? token : null
  }
  return null
}

export type DeviceIdentity = { userId: string; deviceId: string }

/**
 * Resolve a presented token to its owner. Returns null for anything that
 * doesn't match a live device row.
 *
 * Takes the Supabase client rather than creating one, so the caller decides
 * (service role, in practice — these routes have no user session to act under).
 */
export async function authenticateDevice(
  sb: { from: (table: string) => any },
  authorizationHeader: string | null | undefined,
): Promise<DeviceIdentity | null> {
  const token = bearerFrom(authorizationHeader)
  if (!token) return null

  const { data, error } = await sb
    .from('device_tokens')
    .select('id, user_id')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (error || !data) return null
  return { userId: data.user_id as string, deviceId: data.id as string }
}

/**
 * Is this callback URL safe to hand a freshly minted device token to?
 *
 * The desktop app receives its token by being redirected to a listener it
 * started on localhost — the standard flow for native apps (RFC 8252). The
 * danger is that the callback arrives in a query string, so without this check
 * the pairing page becomes an open redirect that would hand a live credential
 * to any address an attacker put in a link.
 *
 * Loopback only, plain http only (TLS to yourself is pointless and no app can
 * present a valid certificate for 127.0.0.1), and a real port — a token must
 * never leave the machine.
 */
export function isLoopbackCallback(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (url.protocol !== 'http:') return false
  // Credentials in the URL would be sent on to somewhere we haven't checked.
  if (url.username || url.password) return false

  const host = url.hostname.toLowerCase()
  const isLoopbackHost = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  if (!isLoopbackHost) return false

  const port = Number(url.port)
  // A listener the app opened will always be on an ephemeral high port; an
  // absent port would mean 80, which it cannot have bound without privileges.
  return Number.isInteger(port) && port >= 1024 && port <= 65535
}
