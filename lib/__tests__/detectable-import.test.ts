import { describe, it, expect } from 'vitest'
import { importDiscordList } from '../detectable-import'
import { MIN_IMPORT_ROWS } from '../detectable'

/** Records every write; answers reads from `lastApplied`. */
function fakeDb(lastApplied: number | null = null) {
  const calls: { table: string; op: string; payload?: any }[] = []
  const chain = (table: string, op: string, payload?: any) => {
    calls.push({ table, op, payload })
    const result = op === 'select'
      ? { data: lastApplied == null ? [] : [{ rows_upserted: lastApplied }], error: null }
      : { data: [], error: null }
    const q: any = {
      eq: () => q, lt: () => q, order: () => q, limit: () => q, select: () => q,
      then: (resolve: any) => resolve(result),
    }
    return q
  }
  const sb = {
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      insert: (p: any) => chain(table, 'insert', p),
      upsert: (p: any) => chain(table, 'upsert', p),
      delete: () => chain(table, 'delete'),
    }),
  }
  const writesTo = (table: string) => calls.filter(c => c.table === table && c.op !== 'select')
  const run = () => calls.find(c => c.table === 'detectable_import_runs' && c.op === 'insert')?.payload
  return { sb, writesTo, run }
}

const respond = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

function bigList(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i), name: `Game ${i}`,
    executables: [{ is_launcher: false, name: `game${i}/game${i}.exe`, os: 'win32' }],
  }))
}

describe('importDiscordList', () => {
  it('records a failure and leaves the table alone when Discord is down', async () => {
    const db = fakeDb()
    const out = await importDiscordList(db.sb, respond({}, 503))
    expect(out.status).toBe('failed')
    expect(db.writesTo('detectable_games')).toEqual([])
    expect(db.run().status).toBe('failed')
  })

  it('rejects an unexpected shape without touching the table', async () => {
    const db = fakeDb()
    const out = await importDiscordList(db.sb, respond({ applications: [] }))
    expect(out.status).toBe('rejected')
    expect(db.writesTo('detectable_games')).toEqual([])
  })

  it('rejects a list that shrank sharply since the last import', async () => {
    const db = fakeDb(MIN_IMPORT_ROWS * 2)
    const out = await importDiscordList(db.sb, respond(bigList(MIN_IMPORT_ROWS)))
    expect(out.status).toBe('rejected')
    expect(db.writesTo('detectable_games')).toEqual([])
  })

  it('upserts a good list in batches and only ever deletes stale Discord rows', async () => {
    const db = fakeDb()
    const out = await importDiscordList(db.sb, respond(bigList(MIN_IMPORT_ROWS + 1)))
    expect(out).toMatchObject({ status: 'applied', rows_upserted: MIN_IMPORT_ROWS + 1 })
    const upserts = db.writesTo('detectable_games').filter(c => c.op === 'upsert')
    expect(upserts).toHaveLength(Math.ceil((MIN_IMPORT_ROWS + 1) / 1000))
    expect(upserts.every(u => u.payload.every((r: any) => r.source === 'discord'))).toBe(true)
  })
})
