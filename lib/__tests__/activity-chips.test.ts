import { describe, it, expect } from 'vitest'
import { chipsThatFit } from '../activity-chips'

const base = { chipWidths: [100, 100, 100, 100], moreWidth: 60, gap: 6 }

describe('chipsThatFit', () => {
  it('names them all when they all fit (no "+N more" needed)', () => {
    expect(chipsThatFit({ ...base, available: 418 })).toBe(4) // 4×100 + 3×6
  })

  it('leaves room for "+N more" when they don\'t', () => {
    // 3 chips (312) + gap + more (66) = 378 fits in 400; all 4 (418) don't.
    expect(chipsThatFit({ ...base, available: 400 })).toBe(3)
    // 2 chips (206) + 66 = 272 fits in 300; 3 + more (378) doesn't.
    expect(chipsThatFit({ ...base, available: 300 })).toBe(2)
  })

  it('names none when even one chip and the button won\'t fit', () => {
    expect(chipsThatFit({ ...base, available: 150 })).toBe(0)
  })

  it('copes with mixed widths', () => {
    expect(chipsThatFit({ chipWidths: [80, 176, 60], moreWidth: 60, gap: 6, available: 300 })).toBe(1)
  })

  it('handles an empty batch', () => {
    expect(chipsThatFit({ chipWidths: [], moreWidth: 60, gap: 6, available: 100 })).toBe(0)
  })
})
