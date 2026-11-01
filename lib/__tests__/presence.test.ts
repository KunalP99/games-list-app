import { describe, it, expect } from 'vitest'
import { isSessionLive, liveGameIds, LIVE_STALE_AFTER_MS } from '../presence'

const now = Date.parse('2026-10-30T12:00:00Z')
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString()

describe('isSessionLive', () => {
  it('is live while recently checkpointed and not ended', () => {
    expect(isSessionLive({ ended_at: null, started_at: minsAgo(30), last_checkpoint_at: minsAgo(2) }, now))
      .toBe(true)
  })

  it('is never live once ended, however recent the checkpoint', () => {
    expect(isSessionLive({ ended_at: minsAgo(1), started_at: minsAgo(30), last_checkpoint_at: minsAgo(1) }, now))
      .toBe(false)
  })

  it('goes stale once the checkpoint is old enough', () => {
    // A crash or a sleeping PC stops the checkpoints without ever setting
    // ended_at — recency is the only signal that it actually stopped.
    const justUnder = LIVE_STALE_AFTER_MS / 60_000 - 1
    const justOver = LIVE_STALE_AFTER_MS / 60_000 + 1
    expect(isSessionLive({ ended_at: null, started_at: minsAgo(60), last_checkpoint_at: minsAgo(justUnder) }, now))
      .toBe(true)
    expect(isSessionLive({ ended_at: null, started_at: minsAgo(60), last_checkpoint_at: minsAgo(justOver) }, now))
      .toBe(false)
  })

  it('falls back to started_at when there has been no checkpoint yet', () => {
    // The agent sends one immediately on start, but a row observed between
    // "session created" and "first checkpoint lands" should still read live.
    expect(isSessionLive({ ended_at: null, started_at: minsAgo(2), last_checkpoint_at: null }, now)).toBe(true)
    expect(isSessionLive({ ended_at: null, started_at: minsAgo(60), last_checkpoint_at: null }, now)).toBe(false)
  })

  it('treats an unparseable timestamp as not live', () => {
    expect(isSessionLive({ ended_at: null, started_at: 'not a date', last_checkpoint_at: null }, now)).toBe(false)
  })
})

describe('liveGameIds', () => {
  it('keeps only the live rows, keyed by game', () => {
    const rows = [
      { game_id: 'a', ended_at: null, started_at: minsAgo(5), last_checkpoint_at: minsAgo(1) },
      { game_id: 'b', ended_at: minsAgo(1), started_at: minsAgo(40), last_checkpoint_at: minsAgo(1) },
      { game_id: 'c', ended_at: null, started_at: minsAgo(90), last_checkpoint_at: minsAgo(90) },
    ]
    expect(Array.from(liveGameIds(rows, now).keys())).toEqual(['a'])
  })

  it('carries the startedAt of a live session through, for a client tick to use', () => {
    const started = minsAgo(5)
    const rows = [{ game_id: 'a', ended_at: null, started_at: started, last_checkpoint_at: minsAgo(1) }]
    expect(liveGameIds(rows, now).get('a')).toBe(started)
  })

  it('drops rows with no game — the game was deleted, not stopped', () => {
    const rows = [{ game_id: null, ended_at: null, started_at: minsAgo(1), last_checkpoint_at: minsAgo(1) }]
    expect(liveGameIds(rows, now).size).toBe(0)
  })

  it('does not let one game appear twice, however many rows it has', () => {
    // E.g. an orphaned row from a crashed session, plus a fresh one for the
    // same game — only one entry should come out.
    const rows = [
      { game_id: 'a', ended_at: null, started_at: minsAgo(2), last_checkpoint_at: minsAgo(1) },
      { game_id: 'a', ended_at: null, started_at: minsAgo(400), last_checkpoint_at: minsAgo(400) },
    ]
    expect(liveGameIds(rows, now).size).toBe(1)
  })
})
