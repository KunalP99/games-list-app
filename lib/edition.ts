/**
 * Which edition of the app this deployment is.
 *
 * One codebase runs two sites: the `friends` edition (the original app for a
 * closed group of friends) and the `public` edition (the version for anyone).
 * Each has its own Vercel project and Supabase database; this setting is what
 * tells them apart. It's `NEXT_PUBLIC_` so client components can read it, and
 * it's fixed at build time, which is fine since each Vercel project builds on
 * its own.
 *
 * The friends edition is the default: an unset or unknown value behaves
 * exactly as the app did before editions existed. New public-only features
 * get a switch in `FEATURES`, off for friends unless deliberately turned on.
 */

export type Edition = 'friends' | 'public'

/** Only `'public'` means public; anything else (including unset) is friends. */
export function editionFrom(value: string | undefined): Edition {
  return value === 'public' ? 'public' : 'friends'
}

export const EDITION: Edition = editionFrom(process.env.NEXT_PUBLIC_EDITION)

/** What each edition offers. */
export function featuresFor(edition: Edition) {
  return {
    /** The wheel, its history, settings, achievements and dashboard card. */
    wheel: edition === 'friends',
    /**
     * A separate Ambient status for ongoing games the tracker files in. The
     * public edition has a single Playing status instead: tracker-found games
     * are filed as Playing, Ambient isn't offered anywhere, and there's no Now
     * Playing section, just Recently played (tracked Playing games).
     */
    ambient: edition === 'friends',
    /**
     * Dropping a game (DNF) costs tickets. The public edition's tickets only
     * ever go up from playing (they'll be spent on cosmetics), so it has no DNF
     * penalty. Taking back a completion's tickets when a game stops being
     * completed is not a penalty and stays in both: without it, completing and
     * un-completing the same game would mint tickets forever.
     */
    dnfPenalty: edition === 'friends',
    /**
     * "Ticket History" in the nav's History menu. The public edition leaves it
     * out (and, with no Wheel History either, the whole History menu), but the
     * /tickets page itself still exists and is reachable by its address.
     */
    ticketHistoryNav: edition === 'friends',
    /**
     * Everyone's tickets on /tickets. Fine in the friends edition, where
     * everyone signed up is a friend; the public edition shows the viewer's
     * own and their friends' (each friend's privacy setting still applies).
     */
    sharedTicketLedger: edition === 'friends',
    /**
     * The profile banner's "120 (214) tickets": lifetime total, then the
     * spendable balance in brackets. The public edition shows just the balance
     * (what you have now, as in the nav's ticket pill).
     */
    ticketBalanceInBanner: edition === 'friends',
    /**
     * Sign-up fit for strangers: chosen usernames (lib/username.ts, changeable
     * every 30 days), stronger passwords, Turnstile bot checks, Google and
     * Discord sign-in, and forgot/reset password. The friends edition keeps its
     * simple name/email/password login.
     */
    secureAuth: edition === 'public',
    /**
     * Completion tickets and XP only from what the site can check
     * (lib/completion-rewards.ts): IGDB-linked games, completed since joining,
     * tiers from tracked hours, untracked completions +1 up to 5 a day, no 100%
     * or sequel bonus. The friends edition keeps its honour system.
     */
    verifiedRewards: edition === 'public',
    /**
     * Mutual friends (request → accept), blocking and per-person privacy
     * (Everyone / Friends / Only me per item, Settings → Privacy). The
     * database enforces it (db/friends.sql, can_view); pages that list other
     * people show only friends. The friends edition has no such thing:
     * everyone signed up is a friend and sees everything, as before.
     */
    friendSystem: edition === 'public',
    /**
     * Look up any game: the dashboard's search bar (all of IGDB) and a
     * store-style page per game at /discover/<igdbId> (trailer, screenshots,
     * IGDB and Steam ratings, DLC and editions, where to buy, friends who have
     * it, add to your library). The friends edition has neither.
     */
    gameStore: edition === 'public',
    /**
     * The profile you make your own (lib/profile-cards.ts): the profile card
     * at the top, then cards you pick, size and drag into place, with the
     * games list on its own Games tab, and Profile first in the nav. The
     * friends edition keeps its profile page as it was.
     */
    newProfile: edition === 'public',
  }
}

export const FEATURES = featuresFor(EDITION)

/**
 * A status as this edition stores it. Without Ambient, anything that would be
 * Ambient (an old desktop app asking for it, a stale form) becomes Playing,
 * rather than being refused.
 */
export function statusForEdition<T extends string>(edition: Edition, status: T): T | 'playing' {
  return status === 'ambient' && !featuresFor(edition).ambient ? 'playing' : status
}

export function editionStatus<T extends string>(status: T): T | 'playing' {
  return statusForEdition(EDITION, status)
}

/** The product's name, until the public edition has a real one. */
export const PLACEHOLDER_BRAND_NAME = 'Untitled'

export type Brand = { name: string; tagline: string }

export function brandFor(edition: Edition, brandName: string | undefined): Brand {
  if (edition === 'friends') {
    return { name: 'GamesList', tagline: 'Track games. Earn tickets. Spin the wheel.' }
  }
  return { name: brandName?.trim() || PLACEHOLDER_BRAND_NAME, tagline: 'Track your games, automatically.' }
}

export const BRAND: Brand = brandFor(EDITION, process.env.NEXT_PUBLIC_BRAND_NAME)

/**
 * Whether the wheel is on for this user: the edition has it, and they haven't
 * turned it off in Settings (`wheel_enabled`, on unless set false).
 */
export function wheelOnFor(edition: Edition, profile: { wheel_enabled?: boolean | null } | null | undefined): boolean {
  return featuresFor(edition).wheel && (profile?.wheel_enabled ?? true)
}

export function wheelOn(profile: { wheel_enabled?: boolean | null } | null | undefined): boolean {
  return wheelOnFor(EDITION, profile)
}
