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
     * everyone signed up is a friend; the public edition shows only the
     * viewer's own (later: theirs and their friends').
     */
    sharedTicketLedger: edition === 'friends',
    /**
     * The profile banner's "120 (214) tickets": lifetime total, then the
     * spendable balance in brackets. The public edition shows just the balance
     * (what you have now, as in the nav's ticket pill).
     */
    ticketBalanceInBanner: edition === 'friends',
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
