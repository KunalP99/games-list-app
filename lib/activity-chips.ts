/**
 * How many of a batch's chips fit on one line of `available` pixels
 * (components/activity/ActivityBatchChips.tsx). If they don't all fit, the
 * "+N more" button needs room too, so fewer are named. At least one is
 * named when there's any room for it, so a row never shows only "+N more"
 * unless even one chip plus the button won't fit.
 */
export function chipsThatFit({ available, chipWidths, moreWidth, gap }: {
  available: number
  chipWidths: number[]
  moreWidth: number
  gap: number
}): number {
  const n = chipWidths.length
  const widthOf = (k: number) =>
    chipWidths.slice(0, k).reduce((sum, w) => sum + w, 0) + Math.max(0, k - 1) * gap

  if (widthOf(n) <= available) return n
  for (let k = n - 1; k >= 1; k--) {
    if (widthOf(k) + gap + moreWidth <= available) return k
  }
  return 0
}
