import { test, expect } from '@playwright/test'
import { login, TEST_USER } from './helpers'
import { admin, userId, tempGames, minutesAgo } from './db'

// The activity feed: a session the desktop app never closed (app restarted,
// crash, PC asleep) shows its real end time, not "– now" forever; a session
// that's genuinely running still counts as running. Runs in either edition.

const ukTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

const games = {} as ReturnType<typeof tempGames>
test.afterAll(async () => { await games.cleanup() })

test('an unclosed session ends at its last check-in; a live one is still running', async ({ page }) => {
  const uid = await userId(TEST_USER.email)
  Object.assign(games, tempGames(uid))
  const stale = await games.add({ title: 'ZZ E2E Stale Session', status: 'playing' })
  const staleStart = minutesAgo(300), staleLast = minutesAgo(180)
  await admin().from('play_sessions').insert([
    { user_id: uid, game_id: stale, client_session_id: 'e2e-fin-' + stale, minutes: 30, started_at: minutesAgo(420), ended_at: minutesAgo(390), last_checkpoint_at: minutesAgo(390), applied_hours: 0.5 },
    { user_id: uid, game_id: stale, client_session_id: 'e2e-stale-' + stale, minutes: 120, started_at: staleStart, last_checkpoint_at: staleLast, ended_at: null, applied_hours: 2 },
  ])
  const live = await games.add({ title: 'ZZ E2E Live Session', status: 'playing' })
  await admin().from('play_sessions').insert({ user_id: uid, game_id: live, client_session_id: 'e2e-live-' + live, minutes: 40, started_at: minutesAgo(42), last_checkpoint_at: minutesAgo(2), ended_at: null, applied_hours: 0.7 })

  await login(page, TEST_USER)
  await page.goto('/activity')
  const headline = page.getByText(/played ZZ E2E Stale Session for/).filter({ visible: true }).first()
  await expect(headline).toBeVisible()
  await expect(headline, 'the day adds both sessions, and isn\'t "playing now"').toHaveText(/for 2h 30m/)
  await expect(headline).not.toHaveText(/playing now/)

  await headline.locator('xpath=ancestor-or-self::*[.//button][1]').getByRole('button').first().click()
  await expect(page.getByText(`${ukTime(staleStart)} – ${ukTime(staleLast)}`).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(`${ukTime(staleStart)} – now`)).toHaveCount(0)

  await expect(page.getByText(/started playing ZZ E2E Live Session/).filter({ visible: true }).first(), 'a live session still counts as running').toBeVisible()
})
