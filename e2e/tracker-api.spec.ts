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

// Kunal's case: GTA IV completed years ago (the exact match, 731), and now
// the Complete Edition being played. The hours go to the Complete Edition,
// rather than a replay of the completed game being offered.
test('identify: an owned edition that can take hours beats a completed exact match', async () => {
  await admin().from('games').delete().eq('user_id', uid).ilike('title', 'Grand Theft Auto IV%')
  const done = await games.add({ title: 'Grand Theft Auto IV', status: 'completed', igdb_id: 731, completion_date: '2015-01-01' })
  const ce = await games.add({ title: 'Grand Theft Auto IV: Complete Edition', status: 'playing', igdb_id: 27912 })
  const body = await (await device.post('/api/agent/identify', { steamAppId: 12210, exeName: 'GTAIV.exe', platform: 'Steam' })).json()
  expect(body).toMatchObject({ result: 'tracked', gameId: ce })
  const { data } = await admin().from('games').select('id, status, steam_appid').in('id', [done, ce])
  expect(data!.find(g => g.id === done)!.status, 'the completed game is left alone').toBe('completed')
  expect(data!.find(g => g.id === ce)!.steam_appid).toBe(12210)
})

test('identify: with only the completed game, it still offers a replay (untracked)', async () => {
  await admin().from('games').delete().eq('user_id', uid).ilike('title', 'Grand Theft Auto IV%')
  const done = await games.add({ title: 'Grand Theft Auto IV', status: 'completed', igdb_id: 731, completion_date: '2015-01-01' })
  const body = await (await device.post('/api/agent/identify', { steamAppId: 12210, exeName: 'GTAIV.exe', platform: 'Steam' })).json()
  expect(body).toMatchObject({ result: 'untracked', gameId: done, resumable: 'completed' })
})

// The Witcher 3 (Steam 292030 → base game 1942 on IGDB): an edition two
// steps away (10th Anniversary Edition, a version of the Complete Edition,
// itself a version of 1942) still counts; a DLC never takes the base game's
// hours (it runs inside the base game, so owning only the DLC adds the game).
test('identify: The Witcher 3, an edition of an edition counts as the same game', async () => {
  await admin().from('games').delete().eq('user_id', uid).ilike('title', 'The Witcher 3%')
  const anniversary = await games.add({ title: 'The Witcher 3: Wild Hunt - Complete Edition: 10th Anniversary Edition', status: 'playing', igdb_id: 372654 })
  const body = await (await device.post('/api/agent/identify', { steamAppId: 292030, exeName: 'witcher3.exe', platform: 'Steam' })).json()
  expect(body).toMatchObject({ result: 'tracked', gameId: anniversary })
})

test('identify: The Witcher 3, owning only a DLC adds the game rather than tracking the DLC', async () => {
  await admin().from('games').delete().eq('user_id', uid).ilike('title', 'The Witcher 3%')
  const dlc = await games.add({ title: 'The Witcher 3: Wild Hunt - Blood and Wine', status: 'playing', igdb_id: 13166 })
  const body = await (await device.post('/api/agent/identify', { steamAppId: 292030, exeName: 'witcher3.exe', platform: 'Steam' })).json()
  try {
    expect(body.result).toBe('added')
    expect(body.gameId).not.toBe(dlc)
  } finally {
    if (body.gameId && body.gameId !== dlc) await admin().from('games').delete().eq('id', body.gameId)
  }
})

test('unlink with a game id removes only that game\'s link to the exe', async () => {
  const retail = await games.add({ title: 'ZZ E2E Unlink Retail', status: 'playing' })
  const forever = await games.add({ title: 'ZZ E2E Unlink Forever', status: 'playing' })
  await admin().from('game_executables').insert([
    { user_id: uid, game_id: retail, exe_name: 'zz-e2e-wow.exe', path_suffix: '_retail_/zz-e2e-wow.exe' },
    { user_id: uid, game_id: forever, exe_name: 'zz-e2e-wow.exe', path_suffix: '_forever_/zz-e2e-wow.exe' },
  ])
  const linksFor = async () => ((await admin().from('game_executables').select('game_id').eq('user_id', uid).eq('exe_name', 'zz-e2e-wow.exe')).data ?? []).map(r => r.game_id)
  try {
    expect((await device.post('/api/agent/unlink', { exeName: 'zz-e2e-wow.exe', gameId: 'nope' })).status).toBe(400)
    expect((await device.post('/api/agent/unlink', { exeName: 'zz-e2e-wow.exe', gameId: retail })).status).toBe(200)
    expect(await linksFor()).toEqual([forever])
  } finally {
    await admin().from('game_executables').delete().eq('user_id', uid).eq('exe_name', 'zz-e2e-wow.exe')
  }
})

// Emulator mode (lib/agent-emulator.ts): a PlayStation game shown in an
// emulator's window title. Real IGDB, limited to that console.
const emu = (emulator: Record<string, unknown>) => device.post('/api/agent/identify', { emulator }).then(r => r.json())
const choose = (body: Record<string, unknown>) => device.post('/api/agent/emulator-choice', body).then(r => r.json())
const forgetEmulated = async () => {
  await admin().from('emulator_titles').delete().eq('user_id', uid)
  await admin().from('games').delete().eq('user_id', uid).ilike('title', 'Shadow of the Colossus%')
}
const exeLinkCount = async () => ((await admin().from('game_executables').select('id').eq('user_id', uid)).data ?? []).length

test('emulator: an exact name not in the library is offered, then added as Playing, Emulated, and remembered', async () => {
  await forgetEmulated()
  const links = await exeLinkCount()
  const ps2 = { platform: 8, serial: 'SCUS-97472', title: 'Shadow of the Colossus' }
  const offer = await emu(ps2)
  expect(offer.result).toBe('add')
  expect(offer.candidates).toHaveLength(1)
  expect(offer.candidates[0].name).toBe('Shadow of the Colossus')

  const added = await choose({ emulator: ps2, igdbId: offer.candidates[0].igdbId, title: offer.candidates[0].name })
  try {
    expect(added).toMatchObject({ result: 'added', status: 'playing' })
    const row = (await admin().from('games').select('status, is_emulated, platform, igdb_id').eq('id', added.gameId).single()).data!
    expect(row).toMatchObject({ status: 'playing', is_emulated: true, platform: 'PS2', igdb_id: offer.candidates[0].igdbId })

    // Remembered by serial: the same disc under any name goes straight to it.
    expect(await emu({ ...ps2, title: 'SHADOW OF THE COLOSSUS (USA)' })).toMatchObject({ result: 'tracked', gameId: added.gameId })
    expect(await exeLinkCount(), 'an emulator never gets an exe link').toBe(links)
  } finally {
    await forgetEmulated()
  }
})

test('emulator: a game already owned is tracked and marked Emulated; a completed one offers a replay', async () => {
  await forgetEmulated()
  const offer = await emu({ platform: 8, title: 'Shadow of the Colossus' })
  const igdbId = offer.candidates[0].igdbId
  const owned = await games.add({ title: 'Shadow of the Colossus', status: 'playing', igdb_id: igdbId })
  try {
    expect(await emu({ platform: 8, title: 'Shadow of the Colossus' })).toMatchObject({ result: 'tracked', gameId: owned })
    expect((await admin().from('games').select('is_emulated').eq('id', owned).single()).data!.is_emulated).toBe(true)

    await admin().from('games').update({ status: 'completed', completion_date: '2020-01-01' }).eq('id', owned)
    expect(await emu({ platform: 8, title: 'Shadow of the Colossus' })).toMatchObject({ result: 'untracked', gameId: owned, resumable: 'completed' })
  } finally {
    await forgetEmulated()
  }
})

test('emulator: no exact match offers up to 3 to pick from; "None of these" is never asked again', async () => {
  await forgetEmulated()
  const fuzzy = { platform: 8, title: 'Shadow Colossus' }
  const pick = await emu(fuzzy)
  expect(pick.result).toBe('pick')
  expect(pick.candidates.length).toBeGreaterThan(0)
  expect(pick.candidates.length).toBeLessThanOrEqual(3)
  expect(pick.candidates.map((c: { name: string }) => c.name)).toContain('Shadow of the Colossus')

  expect(await choose({ emulator: fuzzy, none: true })).toEqual({ result: 'ignored' })
  expect(await emu(fuzzy)).toEqual({ result: 'ignored' })
  await forgetEmulated()
})

test('emulator: an unsupported console or nothing to go on is refused', async () => {
  expect((await device.post('/api/agent/identify', { emulator: { platform: 6, title: 'Doom' } })).status).toBe(400)
  expect((await device.post('/api/agent/identify', { emulator: { platform: 8 } })).status).toBe(400)
  expect((await device.post('/api/agent/emulator-choice', { emulator: { platform: 8, title: 'X' } })).status).toBe(400)
})

test('identify is limited to 30 a minute per account', async () => {
  await fillRateLimit(uid, 'agent_identify', 30)
  const res = await device.post('/api/agent/identify', { titleGuess: 'Portal 2', exeName: 'portal2.exe' })
  expect(res.status).toBe(429)
})
