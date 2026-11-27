import { describe, expect, it } from 'vitest'
import { hoursTickets, minutesToNextTicket, typedHoursTickets, wheelCompletionTickets, MINUTES_PER_TICKET } from '../hours-tickets'

describe('hoursTickets: the 25-hour counter', () => {
  it('pays nothing until 25 hours, then 1 and keeps the rest', () => {
    expect(hoursTickets(0, 24 * 60)).toEqual({ tickets: 0, counter: 1440, counted: 1440 })
    expect(hoursTickets(1440, 90)).toEqual({ tickets: 1, counter: 30, counted: 90 })
  })

  it('pays several at once for a long stretch', () => {
    expect(hoursTickets(600, 60 * 60)).toEqual({ tickets: 2, counter: 1200, counted: 3600 })
  })

  it('only counts what the daily cap leaves', () => {
    expect(hoursTickets(1400, 300, 60)).toEqual({ tickets: 0, counter: 1460, counted: 60 })
    expect(hoursTickets(1400, 300, 100)).toEqual({ tickets: 1, counter: 0, counted: 100 })
    expect(hoursTickets(100, 300, 0)).toEqual({ tickets: 0, counter: 100, counted: 0 })
    expect(hoursTickets(100, 300, null).counted).toBe(300)
  })

  it('ignores negative input', () => {
    expect(hoursTickets(0, -60)).toEqual({ tickets: 0, counter: 0, counted: 0 })
  })

  it('says how far the next ticket is', () => {
    expect(minutesToNextTicket(0)).toBe(MINUTES_PER_TICKET)
    expect(minutesToNextTicket(1440)).toBe(60)
  })
})

describe('wheelCompletionTickets', () => {
  it.each([
    [0, 1], [19.9, 1], [20, 2], [59.9, 2], [60, 3], [75, 3], [94.9, 3], [95, 4], [114.9, 4], [115, 5], [135, 6],
  ])('%sh pays %i', (hours, tickets) => {
    expect(wheelCompletionTickets(hours)).toBe(tickets)
  })

  it('treats no hours as a short game', () => {
    expect(wheelCompletionTickets(null)).toBe(1)
  })
})

describe('typedHoursTickets', () => {
  it('pays 1 per 25 untracked hours, rounded down', () => {
    expect(typedHoursTickets(50, 0)).toBe(2)
    expect(typedHoursTickets(49.9, 0)).toBe(1)
    expect(typedHoursTickets(24.9, 0)).toBe(0)
  })

  it('leaves out the tracked hours, which paid as they were played', () => {
    expect(typedHoursTickets(60, 40)).toBe(0)
    expect(typedHoursTickets(80, 30)).toBe(2)
    expect(typedHoursTickets(30, 45)).toBe(0)
    expect(typedHoursTickets(null, 0)).toBe(0)
  })
})
