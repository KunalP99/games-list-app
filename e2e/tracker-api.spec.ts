import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { TEST_USER_2 } from './helpers'
import { admin, userId, tempGames, tempDevice, fillRateLimit, minutesAgo } from './db'

// The desktop tracker's API, called the way the app calls it (a device token,
// no browser). Hours are counted once, completed games are never written to,
// a session the app never closed is closed by the next one, tokens can't make
// more tokens, and identify is rate limited. Runs in either edition.

test.describe.configure({ mode: 'serial' })

let uid: string
const games = {} as ReturnType<typeof tempGames>
let device: Awaited<ReturnType<typeof tempDevice>>

test.beforeAll(async () => {
  uid = await userId(TEST_USER_2.email)
  Object.assign(games, tempGames(uid))
  device = await tempDevice(uid)
})
test.afterAll(async () => {
  await games.cleanup()
  await device.cleanup()
  await admin().from('rate_limits').delete().eq('user_id', uid)
})

const hours = (id: string) => admin().from('games').select('hours_played').eq('id', id).single().then(r => Number(r.data!.hours_played))
const checkpoint = (body: Record<string, unknown>) => device.post('/api/agent/session', body).then(r => r.json())

test('the same checkpoint sent twice at once adds its hours once; later ones add normally', async () => {
  const id = await games.add({ title: 'ZZ E2E Tracked', status: 'playing', hours_played: 2 })
  const body = { clientSessionId: 'e2e-' + randomUUID(), minutes: 60, startedAt: minutesAgo(120), gameId: id }
  const [a, b] = await Promise.all([checkpoint(body), checkpoint(body)])
  expect(await hours(id)).toBe(3)
  expect([a.addedHours, b.addedHours].sort()).toEqual([0, 1])
  expect((await checkpoint(body)).addedHours, 'a later replay adds nothing').toBe(0)

  // The server never adds more than the real time since the previous checkpoint.
  await admin().from('play_sessions').update({ last_checkpoint_at: minutesAgo(30) }).eq('client_session_id', body.clientSessionId)
  expect((await checkpoint({ ...body, minutes: 90 })).addedHours).toBe(0.5)
  expect(await hours(id)).toBe(3.5)

  await admin().from('games').update({ status: 'completed' }).eq('id', id)
  const ignored = await checkpoint({ ...body, minutes: 110 })
  expect(ignored).toMatchObject({ ignored: true, reason: 'not_trackable' })
  expect(await hours(id), 'a completed game is never written to').toBe(3.5)
})

test('a new session on the same PC closes one the app never closed; other games are left alone', async () => {
  const id = await games.add({ title: 'ZZ E2E Orphan', status: 'playing', hours_played: 1 })
  const first = { clientSessionId: 'e2e-o1-' + randomUUID(), minutes: 60, startedAt: minutesAgo(180), gameId: id }
  await checkpoint(first)
  const open = (await admin().from('play_sessions').select('ended_at, last_checkpoint_at').eq('client_session_id', first.clientSessionId).single()).data!
  expect(open.ended_at).toBeNull()

  const second = { clientSessionId: 'e2e-o2-' + randomUUID(), minutes: 0, startedAt: minutesAgo(1), gameId: id }
  expect((await checkpoint(second)).ok).toBe(true)
  const closed = (await admin().from('play_sessions').select('ended_at').eq('client_session_id', first.clientSessionId).single()).data!
  expect(Date.parse(closed.ended_at!)).toBe(Date.parse(open.last_checkpoint_at!))
  expect((await admin().from('play_sessions').select('ended_at').eq('client_session_id', second.clientSessionId).single()).data!.ended_at).toBeNull()

  const other = await games.add({ title: 'ZZ E2E Other', status: 'playing' })
  await checkpoint({ clientSessionId: 'e2e-o3-' + randomUUID(), minutes: 0, startedAt: minutesAgo(0.5), gameId: other })
  expect((await admin().from('play_sessions').select('ended_at').eq('client_session_id', second.clientSessionId).single()).data!.ended_at).toBeNull()
})

test('a device token can no longer create more tokens; listing devices still works', async () => {
  const mint = await device.post('/api/agent/devices', { label: 'x' })
  expect(mint.status).toBe(410)
  expect((await mint.json()).error).toMatch(/Connect/)
  const list = await fetch('http://localhost:3000/api/agent/devices', { headers: { Authorization: 'Bearer ' + device.token } })
  expect(list.status).toBe(200)
})

// Steam's "Grand Theft Auto IV" app (12210) maps to the base game on IGDB
// (731), but what people own now is "GTA IV: Complete Edition" (27912, a
// version of 731). It must count as the owned edition, not file a second game.
// Uses the real IGDB, so needs internet and the IGDB keys.
test('identify: running the base game counts as the owned edition (GTA IV → Complete Edition)', async () => {
  const ce = await games.add({ title: 'Grand Theft Auto IV: Complete Edition', status: 'playing', igdb_id: 27912 })
  const countGta = async () => ((await admin().from('games').select('id').eq('user_id', uid).ilike('title', 'Grand Theft Auto IV%')).data ?? []).length
  const before = await countGta()
  const body = await (await device.post('/api/agent/identify', { steamAppId: 12210, exeName: 'GTAIV.exe', platform: 'Steam' })).json()
  expect(body).toMatchObject({ result: 'tracked', gameId: ce })
  expect(await countGta(), 'no second GTA IV row').toBe(before)
  expect((await admin().from('games').select('steam_appid').eq('id', ce).single()).data!.steam_appid, 'so the next launch matches directly').toBe(12210)
})

test('identify is limited to 30 a minute per account', async () => {
  await fillRateLimit(uid, 'agent_identify', 30)
  const res = await device.post('/api/agent/identify', { titleGuess: 'Portal 2', exeName: 'portal2.exe' })
  expect(res.status).toBe(429)
})
