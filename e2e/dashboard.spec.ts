import { test, expect } from '@playwright/test'
import { login, TEST_USER } from './helpers'
import { admin, userId } from './db'

// The dashboard's "your current game" card: shown for a Playing game (or, in
// the friends edition, an Ambient one), and absent altogether with neither.
// Both editions.

test('no Playing (or Ambient) games: no current-game card at all', async ({ page }) => {
  const uid = await userId(TEST_USER.email)
  const db = admin()
  const { data } = await db.from('games').select('id, status').eq('user_id', uid).in('status', ['playing', 'ambient'])
  const moved = (data ?? []) as { id: string; status: string }[]
  try {
    if (moved.length) await db.from('games').update({ status: 'backlog' }).in('id', moved.map(g => g.id))
    await login(page, TEST_USER)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Hours played')).toBeVisible() // the stats still lead the page
    await expect(page.getByRole('region', { name: 'Your current game' })).toHaveCount(0)
    await expect(page.getByText('Pick something to play')).toHaveCount(0)
  } finally {
    for (const g of moved) await db.from('games').update({ status: g.status }).eq('id', g.id)
  }
})

test('a Playing game: the card shows it', async ({ page }) => {
  await login(page, TEST_USER)
  await page.goto('/dashboard')
  await expect(page.getByRole('region', { name: 'Your current game' })).toBeVisible()
})
