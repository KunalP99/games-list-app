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
