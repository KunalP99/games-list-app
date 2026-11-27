import { createClient } from '@/lib/supabase/server'
import { computeUserStats, type UserStats } from '@/lib/user-stats'
import { loadProfileCardData } from '@/lib/data/profile-cards'
import { PROFILE_CARDS, PROFILE_CARD_IDS, isCardItem, normaliseLayout, trimEmpties, type ProfileCardId } from '@/lib/profile-cards'
import type { PrivacyKey } from '@/lib/friends'
import ProfileView from './ProfileView'
import { resolveBannerImage } from '@/lib/hero-banner'
import { getCurrentStreak } from '@/lib/data/current-streak'

/**
 * The public edition's profile Overview. Loads only what the cards need: the
 * owner gets every card's data (so a card added while editing has something
 * to show), anyone else only the cards on the layout that their privacy
 * settings let them see.
 */
export default async function ProfileOverview({
  profile,
  name,
  initials,
  accent,
  isOwner,
  allows,
  friendButton,
}: {
  profile: { id: string; username: string; xp: number | null; bio: string | null; profile_layout: unknown }
  name: string
  initials: string
  accent: string
  isOwner: boolean
  allows: (key: PrivacyKey) => boolean
  friendButton: React.ReactNode
}) {
  const supabase = await createClient()
  const [stats, streak] = await Promise.all([
    computeUserStats(supabase, profile.id),
    allows('privacy_activity') ? getCurrentStreak(supabase, profile.id) : Promise.resolve(0),
  ])

  const stored = normaliseLayout(profile.profile_layout)
  // A visitor doesn't get the cards their privacy hides (the rest close up);
  // kept empty spaces stay, so the cards around them sit where the owner put them.
  const layout = isOwner ? stored : trimEmpties(stored.filter(item => !isCardItem(item) || allows(PROFILE_CARDS[item.card].privacy)))
  const placed = layout.filter(isCardItem)
  const cards = new Set<ProfileCardId>(isOwner ? PROFILE_CARD_IDS : placed.map(item => item.card))
  // The owner may change the shelf while editing, so gets every completed game.
  const shelfChosen = isOwner ? undefined : (placed.find(item => item.card === 'shelf')?.games ?? [])
  const data = await loadProfileCardData(supabase, profile.id, cards, stats, shelfChosen)
  const seesGames = allows('privacy_games')
  // The banner (the Cinematic one, as on the friends edition): this week's
  // game's picture, then only what this viewer may see. Its long lists aren't
  // needed by the banner, so they don't go to the browser.
  const bannerImage = stats.heroGame ? await resolveBannerImage(stats.heroGame) : null
  const heroStats: UserStats = { ...stats, genreData: [], platformData: [], gamesPerYear: [] }

  return (
    <ProfileView
      name={name}
      username={profile.username}
      initials={initials}
      accent={accent}
      hero={{ stats: heroStats, bannerImage, streak, showTickets: allows('privacy_tickets'), showFigures: seesGames }}
      layout={layout}
      bio={profile.bio}
      data={data}
      isOwner={isOwner}
      friendButton={friendButton}
    />
  )
}
