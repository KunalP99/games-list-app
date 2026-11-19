import { test, expect } from '@playwright/test'
import { login, addAllBacklogGames, TEST_USER_2, EDITION } from './helpers'
import { resetTestWheelState } from './reset-state'
import { admin, userId } from './db'

// Wheel wins and the library, and finishing a turn exactly once. Friends
// edition only (the public edition has no wheel).

test.skip(EDITION === 'public', 'The public edition has no wheel.')
test.describe.configure({ mode: 'serial' })

let uid: string
test.beforeAll(async () => { uid = await userId(TEST_USER_2.email) })
test.beforeEach(async () => { await resetTestWheelState() })
test.afterAll(async () => { await resetTestWheelState() })

test('a backlog game that is not linked to IGDB moves to Playing when it wins', async ({ page }) => {
  // Unlink test-sam's backlog games for this test only.
  const { data: backlog } = await admin().from('games').select('id, igdb_id').eq('user_id', uid).eq('status', 'backlog')
  const links = (backlog ?? []) as { id: string; igdb_id: number | null }[]
  await admin().from('games').update({ igdb_id: null }).in('id', links.map(g => g.id))
  const since = new Date().toISOString()
  try {
    await login(page, TEST_USER_2)
    await page.goto('/wheel')
    await addAllBacklogGames(page)
    await page.getByRole('button', { name: 'First Land' }).click()
    await page.getByRole('button', { name: '🎰 Spin!' }).click()
    await expect(page.getByText('You got')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: '✅ Accept this game' }).click()
    // Nothing to review for a game already in the library: it goes straight through.
    await expect(page.getByText('Good luck!')).toBeVisible({ timeout: 20_000 })

    const { data: spin } = await admin().from('wheel_spins').select('result_name').eq('user_id', uid).gte('created_at', since).single()
    const { data: won } = await admin().from('games').select('status, assigned_by').eq('user_id', uid).eq('title', spin!.result_name!).single()
    expect(won).toEqual({ status: 'playing', assigned_by: uid })
    const { data: profile } = await admin().from('profiles').select('pending_wheel_game_id').eq('id', uid).single()
    expect(profile!.pending_wheel_game_id, 'and it counts as the wheel\'s pick (DNF hands the turn back)').not.toBeNull()
  } finally {
    for (const g of links) await admin().from('games').update({ igdb_id: g.igdb_id }).eq('id', g.id)
  }
})

test('two tabs skipping the same Choose turn pay +2 once and move the turn once', async ({ browser }) => {
  await admin().from('profiles').update({ wheel_turn: 'choose', wheel_session: null, wheel_enabled: true }).eq('id', uid)
  const { data: before } = await admin().from('profiles').select('ticket_balance').eq('id', uid).single()
  const since = new Date().toISOString()
  const context = await browser.newContext()
  const first = await context.newPage()
  await login(first, TEST_USER_2)
  const second = await context.newPage()
  const skip = /^Skip \(\+2/
  try {
    for (const p of [first, second]) {
      await p.goto('/wheel')
      await p.getByRole('button', { name: skip }).waitFor()
    }
    await Promise.all([first, second].map(p => p.getByRole('button', { name: skip }).click()))
    await expect.poll(async () => (await admin().from('profiles').select('wheel_turn').eq('id', uid).single()).data!.wheel_turn).toBe('spin')
    await first.waitForTimeout(2_000)
    const { data: after } = await admin().from('profiles').select('ticket_balance, wheel_turn').eq('id', uid).single()
    expect(after!.ticket_balance - before!.ticket_balance).toBe(2)
    expect(after!.wheel_turn).toBe('spin')
    const { count } = await admin().from('wheel_spins').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('finalized_via', 'skip').gte('created_at', since)
    expect(count).toBe(1)
  } finally {
    await admin().from('ticket_transactions').delete().eq('user_id', uid).eq('reason', 'turn_skipped').gte('created_at', since)
    await admin().from('wheel_spins').delete().eq('user_id', uid).gte('created_at', since)
    await context.close()
  }
})
