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

test('a game in the feed opens its page, from its title and its cover', async ({ page }) => {
  const uid = await userId(TEST_USER.email)
  if (!games.add) Object.assign(games, tempGames(uid))
  const id = await games.add({ title: 'ZZ E2E Feed Link', status: 'playing', cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co670h.jpg' })
  await admin().from('play_sessions').insert({ user_id: uid, game_id: id, client_session_id: 'e2e-link-' + id, minutes: 30, started_at: minutesAgo(90), ended_at: minutesAgo(60), last_checkpoint_at: minutesAgo(60), applied_hours: 0.5 })

  await login(page, TEST_USER)
  await page.goto('/activity')
  // Every row naming the game links its cover and its title there (it shows
  // twice: put in Playing, then the session).
  const links = page.getByRole('link', { name: 'ZZ E2E Feed Link', exact: true }).filter({ visible: true })
  const title = links.filter({ hasText: 'ZZ E2E Feed Link' })
  const cover = links.filter({ has: page.locator('img') })
  await expect(title.first()).toBeVisible()
  await expect(cover.first()).toBeVisible()
  for (const href of [...await title.evaluateAll(a => a.map(x => x.getAttribute('href'))), ...await cover.evaluateAll(a => a.map(x => x.getAttribute('href')))]) {
    expect(href).toBe(`/games/${id}`)
  }
  await title.first().click()
  await expect(page).toHaveURL(new RegExp(`/games/${id}$`))
  await expect(page.getByRole('heading', { name: 'ZZ E2E Feed Link' }).first()).toBeVisible()
})
