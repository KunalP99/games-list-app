import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { RESERVED_USERNAMES, RESERVED_SUBSTRINGS } from '../username'

// The sign-up trigger (db/public-auth.sql) keeps its own copy of the reserved
// names, because anyone can call Supabase's sign-up directly and skip the app's
// checks. This keeps the two copies from drifting apart.
const sql = readFileSync(join(__dirname, '..', '..', 'db', 'public-auth.sql'), 'utf8')

describe('handle_new_user reserved usernames', () => {
  it('reserves exactly the names in RESERVED_USERNAMES', () => {
    const block = sql.match(/wanted = any \(array\[([\s\S]*?)\]\)/)
    expect(block, 'reserved array not found in db/public-auth.sql').not.toBeNull()
    const inSql = (block![1].match(/'[^']+'/g) ?? []).map(s => s.slice(1, -1))
    expect(new Set(inSql)).toEqual(new Set(RESERVED_USERNAMES))
  })

  it('refuses the same words anywhere in a name as RESERVED_SUBSTRINGS', () => {
    const pattern = sql.match(/wanted !~ '\(([^)]*)\)'/)
    expect(pattern, 'abuse pattern not found in db/public-auth.sql').not.toBeNull()
    expect(new Set(pattern![1].split('|'))).toEqual(new Set(RESERVED_SUBSTRINGS))
  })
})
