import { describe, it, expect } from 'vitest'
import { escapeLike, ilikeAnyFilter } from '../query-escape'

const BS = '\\'

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('Half_Life')).toBe(`Half${BS}_Life`)
    expect(escapeLike('100% Orange')).toBe(`100${BS}% Orange`)
    expect(escapeLike(`a${BS}b`)).toBe(`a${BS}${BS}b`)
  })

  it('leaves ordinary titles alone', () => {
    expect(escapeLike('Chrono Trigger')).toBe('Chrono Trigger')
    expect(escapeLike('Warhammer 40,000: Space Marine (2011)')).toBe('Warhammer 40,000: Space Marine (2011)')
  })
})

describe('ilikeAnyFilter', () => {
  // These exact strings were checked against a real PostgREST: each matches
  // only the literal text.
  it('quotes the value so commas and parentheses are part of the search', () => {
    expect(ilikeAnyFilter(['title', 'developer'], 'Warhammer 40,000')).toBe(
      'title.ilike."%Warhammer 40,000%",developer.ilike."%Warhammer 40,000%"',
    )
    expect(ilikeAnyFilter(['title'], 'Ratchet (2016)')).toBe('title.ilike."%Ratchet (2016)%"')
  })

  it('escapes wildcards inside the quotes, with the backslash itself escaped for PostgREST', () => {
    expect(ilikeAnyFilter(['title'], 'Half_Life')).toBe(`title.ilike."%Half${BS}${BS}_Life%"`)
    expect(ilikeAnyFilter(['title'], '100%')).toBe(`title.ilike."%100${BS}${BS}%%"`)
  })

  it('escapes double quotes, so the text cannot close the quoted value', () => {
    expect(ilikeAnyFilter(['title'], 'Say "Hi"')).toBe(`title.ilike."%Say ${BS}"Hi${BS}"%"`)
    // The injected text stays inside the quotes (its `_` escaped like any other).
    expect(ilikeAnyFilter(['title'], 'x",user_id.eq.1')).toBe(`title.ilike."%x${BS}",user${BS}${BS}_id.eq.1%"`)
  })
})
