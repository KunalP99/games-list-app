// What completing a game earns: its tickets and its completion XP.
//
// Pure rules, unit tested (lib/__tests__/completion-rewards.test.ts); the
// database side is grantCompletionRewards in app/(app)/games/actions.ts.
//
// Two rule sets, chosen by the edition (FEATURES.verifiedRewards):
//
//   friends — exactly as before: tickets and XP from the hours and
//             achievement progress typed in, plus the sequel bonus. An honour
//             system among friends.
//
//   verified (public edition) — tickets will buy cosmetics, so they come only
//             from what the site can check:
//     • the game must be linked to IGDB (made-up titles earn nothing);
//     • it must be completed on or after the day the account was created
//       (bringing your history over earns achievements and stats, not
//       tickets or completion XP);
//     • tracked hours (the desktop app's sessions) set the tier and the 100h+
//       bonus; a game with no tracked time earns the basic +1 ticket and base
//       XP, whatever hours are typed in;
//     • untracked completions earn at most UNTRACKED_DAILY_LIMIT a UK day;
//     • no 100% or sequel bonus (nothing verifies them yet).

import { TICKET_AWARDS } from './constants'
import { calculateCompletionAwards } from './tickets'
import { gameCompletionXp } from './achievements'

export const UNTRACKED_DAILY_LIMIT = 5

/** Why a completion earned what it did, shown on the game's page. */
export type RewardWhy =
  | 'full'            // friends edition rules
  | 'tracked'         // verified: tier from tracked hours
  | 'untracked'       // verified: no tracked time, basic reward
  | 'not_linked'      // verified: not an IGDB game
  | 'no_date'         // verified: no completion date to check
  | 'before_joining'  // verified: completed before the account existed
  | 'daily_limit'     // verified: today's untracked rewards are used up

export type AwardEntry = { reason: string; amount: number }

export type CompletionReward = {
  tickets: AwardEntry[]
  xp: number
  /** Counts towards the daily limit on untracked rewards. */
  untracked: boolean
  why: RewardWhy
}

export type CompletionInput = {
  verified: boolean
  typedHours: number | null
  achievementProgress: number | null
  isSequel: boolean
  /** Hours the desktop app logged against this game (0 if none). */
  trackedHours: number
  /** Linked to the metadata provider (IGDB/RAWG id present). */
  providerLinked: boolean
  /** `YYYY-MM-DD` (year-precision dates are stored as `YYYY-01-01`). */
  completionDate: string | null
  /** The UK day the account was created, `YYYY-MM-DD`. */
  joinedDay: string
  /** Untracked completion rewards already granted today (UK day). */
  untrackedRewardsToday: number
}

const nothing = (why: RewardWhy): CompletionReward => ({ tickets: [], xp: 0, untracked: false, why })

/** The smallest tracked time that counts as "tracked" (one 0.1h step). */
const MIN_TRACKED_HOURS = 0.1

export function completionReward(input: CompletionInput): CompletionReward {
  if (!input.verified) {
    const tickets = calculateCompletionAwards(input.typedHours, input.achievementProgress)
    if (input.isSequel) tickets.push({ reason: 'sequel_back_to_back', amount: TICKET_AWARDS.sequel_back_to_back })
    return { tickets, xp: gameCompletionXp(input.typedHours, input.achievementProgress), untracked: false, why: 'full' }
  }

  if (!input.providerLinked) return nothing('not_linked')
  if (!input.completionDate) return nothing('no_date')
  if (input.completionDate < input.joinedDay) return nothing('before_joining')

  if (input.trackedHours >= MIN_TRACKED_HOURS) {
    // Tracked time is checked against real elapsed time by the server, so it
    // sets the tier and isn't limited per day. No 100% bonus: unverified.
    return {
      tickets: calculateCompletionAwards(input.trackedHours, null),
      xp: gameCompletionXp(input.trackedHours, null),
      untracked: false,
      why: 'tracked',
    }
  }

  if (input.untrackedRewardsToday >= UNTRACKED_DAILY_LIMIT) return nothing('daily_limit')
  return {
    tickets: [{ reason: 'game_completed_short', amount: TICKET_AWARDS.game_completed_short }],
    xp: gameCompletionXp(0, null),
    untracked: true,
    why: 'untracked',
  }
}

/** Total tickets in a reward. */
export function rewardTickets(reward: Pick<CompletionReward, 'tickets'>): number {
  return reward.tickets.reduce((sum, t) => sum + t.amount, 0)
}

/** One line for the game's page explaining the reward (verified rules only). */
export function rewardExplanation(why: RewardWhy, tickets: number, xp: number): string | null {
  const earned = `${tickets} ticket${tickets === 1 ? '' : 's'} and ${xp} XP`
  switch (why) {
    case 'full':
      return null
    case 'tracked':
      return `Earned ${earned} from the hours the desktop app tracked.`
    case 'untracked':
      return `Earned ${earned}. Track your play with the desktop app to earn more for longer games.`
    case 'not_linked':
      return 'No tickets: only games picked from search earn tickets. Edit the game and choose it from the search results.'
    case 'no_date':
      return 'No tickets: add the date you completed it.'
    case 'before_joining':
      return 'No tickets: completed before you joined. Your history counts towards stats and achievements instead.'
    case 'daily_limit':
      return `No tickets: games without tracked time can earn tickets ${UNTRACKED_DAILY_LIMIT} times a day. Try again tomorrow.`
  }
}
