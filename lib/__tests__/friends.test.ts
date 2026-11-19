import { describe, it, expect } from 'vitest'
import {
  relationTo, privacyAllows, PRIVACY_ITEMS, PRIVACY_CHOICES, isPrivacySetting, isPrivacyKey,
  friendOf, searchTerm, type Relation, type FriendGraph,
} from '../friends'

const empty: FriendGraph = { friendships: [], requests: [], blocks: [] }

describe('relationTo', () => {
  it('knows yourself', () => {
    expect(relationTo('a', 'a', empty)).toBe('self')
  })

  it('finds a friendship whichever way round the pair is stored', () => {
    expect(relationTo('a', 'b', { ...empty, friendships: [{ user_a: 'a', user_b: 'b' }] })).toBe('friends')
    expect(relationTo('b', 'a', { ...empty, friendships: [{ user_a: 'a', user_b: 'b' }] })).toBe('friends')
  })

  it('tells a sent request from a received one', () => {
    const g = { ...empty, requests: [{ from_user: 'a', to_user: 'b' }] }
    expect(relationTo('a', 'b', g)).toBe('requested')
    expect(relationTo('b', 'a', g)).toBe('incoming')
  })

  it('shows your own block, but a block against you looks like nothing', () => {
    const g = { ...empty, blocks: [{ blocker: 'a', blocked: 'b' }] }
    expect(relationTo('a', 'b', g)).toBe('blocked')
    expect(relationTo('b', 'a', g)).toBe('none')
  })

  it('puts a block before a friendship', () => {
    expect(relationTo('a', 'b', { ...empty, friendships: [{ user_a: 'a', user_b: 'b' }], blocks: [{ blocker: 'a', blocked: 'b' }] })).toBe('blocked')
  })

  it('is none otherwise', () => {
    expect(relationTo('a', 'b', { friendships: [{ user_a: 'a', user_b: 'c' }], requests: [{ from_user: 'c', to_user: 'b' }], blocks: [] })).toBe('none')
  })
})

describe('privacyAllows', () => {
  const relations: Relation[] = ['self', 'friends', 'requested', 'incoming', 'blocked', 'none']
  const allowed = (setting: 'everyone' | 'friends' | 'only_me') => relations.filter(r => privacyAllows(setting, r))

  it('everyone: all but someone you blocked', () => {
    expect(allowed('everyone')).toEqual(['self', 'friends', 'requested', 'incoming', 'none'])
  })
  it('friends: yourself and friends (a pending request is not a friendship)', () => {
    expect(allowed('friends')).toEqual(['self', 'friends'])
  })
  it('only me: yourself alone', () => {
    expect(allowed('only_me')).toEqual(['self'])
  })
})

describe('privacy items', () => {
  it('match the database defaults (db/friends.sql)', () => {
    expect(Object.fromEntries(PRIVACY_ITEMS.map(i => [i.key, i.default]))).toEqual({
      privacy_profile: 'everyone',
      privacy_games: 'everyone',
      privacy_achievements: 'everyone',
      privacy_activity: 'friends',
      privacy_tickets: 'friends',
    })
  })
  it('validate what a form sends', () => {
    expect(PRIVACY_CHOICES.map(c => c.value).every(isPrivacySetting)).toBe(true)
    expect(isPrivacySetting('public')).toBe(false)
    expect(isPrivacyKey('privacy_games')).toBe(true)
    expect(isPrivacyKey('ticket_balance')).toBe(false)
  })
})

describe('friendOf', () => {
  it('returns the other side', () => {
    expect(friendOf({ user_a: 'a', user_b: 'b' }, 'a')).toBe('b')
    expect(friendOf({ user_a: 'a', user_b: 'b' }, 'b')).toBe('a')
  })
})

describe('searchTerm', () => {
  it('needs two characters, drops a leading @ and trims', () => {
    expect(searchTerm(' s ')).toBeNull()
    expect(searchTerm('@s')).toBeNull()
    expect(searchTerm('  @sam ')).toBe('sam')
    expect(searchTerm('x'.repeat(60))).toHaveLength(40)
  })
})
