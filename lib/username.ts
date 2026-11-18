/**
 * Rules for chosen usernames and passwords (public edition's secure sign-up,
 * lib/edition.ts `secureAuth`). Pure, so every rule is a unit test; the
 * server actions and the sign-up trigger (db/public-auth.sql) apply the same
 * rules, and the database's case-insensitive unique index is the final word on
 * "taken".
 */

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
/** How long after a change before the username can be changed again. */
export const USERNAME_COOLDOWN_DAYS = 30
const DAY_MS = 86_400_000

/**
 * Names nobody can take: the app's own routes (so a profile URL can never be
 * confused with a page), roles that would lend false authority, the product's
 * own names, and a short list of obvious slurs/obscenities. Kept lowercase;
 * usernames are compared lowercased.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Routes and system paths
  'admin', 'administrator', 'root', 'api', 'auth', 'login', 'logout', 'signin', 'signup', 'register',
  'settings', 'dashboard', 'games', 'game', 'users', 'user', 'stats', 'tickets', 'ticket', 'welcome',
  'achievements', 'activity', 'wheel', 'videos', 'notifications', 'download', 'privacy', 'terms',
  'about', 'help', 'support', 'contact', 'reset', 'password', 'forgot', 'callback', 'new', 'edit',
  'null', 'undefined', 'me', 'you', 'everyone', 'anonymous', 'unknown',
  // Roles
  'staff', 'mod', 'mods', 'moderator', 'system', 'official', 'team', 'owner', 'bot',
  // The product
  'gameslist', 'games_list', 'untitled',
  // Obvious abuse (deliberately short; reports handle the long tail)
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'nazi', 'hitler',
])

/** Trimmed and lowercased: usernames are stored and compared in lowercase. */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Reserved outright, or containing one of the abuse words anywhere in it. */
function isReserved(name: string, extraReserved: string[]): boolean {
  if (RESERVED_USERNAMES.has(name) || extraReserved.includes(name)) return true
  const abuse = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'nazi', 'hitler']
  return abuse.some(w => name.includes(w))
}

/**
 * A username is 3–20 characters of a–z, 0–9 and _, starts with a letter, and
 * isn't reserved. Input is normalised first, so "Kunal" is checked as "kunal".
 * `extraReserved` takes names that depend on the deployment (the brand name).
 */
export function validateUsername(raw: string, extraReserved: string[] = []): Validation<string> {
  const name = normaliseUsername(raw)
  if (name.length < USERNAME_MIN) return { ok: false, error: `At least ${USERNAME_MIN} characters.` }
  if (name.length > USERNAME_MAX) return { ok: false, error: `At most ${USERNAME_MAX} characters.` }
  if (!/^[a-z0-9_]+$/.test(name)) return { ok: false, error: 'Only letters, numbers and underscores.' }
  if (!/^[a-z]/.test(name)) return { ok: false, error: 'Start with a letter.' }
  if (isReserved(name, extraReserved.map(normaliseUsername))) return { ok: false, error: 'That username isn’t available.' }
  return { ok: true, value: name }
}

/**
 * Whether a username can be changed now. Never changed (null) means yes. When
 * it can't, `nextAt` is when it can.
 */
export function canChangeUsername(lastChangedAt: string | null, now: Date = new Date()):
  { ok: true } | { ok: false; nextAt: Date } {
  if (!lastChangedAt) return { ok: true }
  const nextAt = new Date(Date.parse(lastChangedAt) + USERNAME_COOLDOWN_DAYS * DAY_MS)
  return now.getTime() >= nextAt.getTime() ? { ok: true } : { ok: false, nextAt }
}

/**
 * A few free alternatives to a taken name: underscore-number, plain number,
 * then a short random tail. `isTaken` is the caller's knowledge of what's
 * used; suggestions are validated too, so a reserved or overlong one is never
 * offered.
 */
export function suggestUsernames(
  base: string,
  isTaken: (name: string) => boolean,
  count = 3,
  random: () => number = Math.random,
): string[] {
  const root = normaliseUsername(base).replace(/[^a-z0-9_]/g, '').slice(0, USERNAME_MAX - 4) || 'player'
  const out: string[] = []
  const tryAdd = (name: string) => {
    if (out.length >= count || out.includes(name)) return
    if (validateUsername(name).ok && !isTaken(name)) out.push(name)
  }
  for (let i = 1; i <= 9 && out.length < count; i++) tryAdd(`${root}_${i}`)
  for (let i = 0; i < 20 && out.length < count; i++) tryAdd(`${root}${Math.floor(random() * 900 + 100)}`)
  return out
}

export const PASSWORD_MIN = 8

/** At least 8 characters, with at least one letter and one number. */
export function validatePassword(password: string): Validation<string> {
  if (password.length < PASSWORD_MIN) return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return { ok: false, error: 'Use at least one letter and one number.' }
  return { ok: true, value: password }
}
