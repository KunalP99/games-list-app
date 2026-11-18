import { BRAND, EDITION } from '@/lib/edition'

/**
 * The product name as shown in the nav and on the login page. The friends
 * edition keeps its two-tone "Games" + "List"; the public edition shows its
 * brand name (a placeholder until it has a real one) in the same style.
 * Size and font come from the wrapping element.
 */
export default function Wordmark() {
  if (EDITION === 'friends') {
    return (
      <>
        <span className="text-fg-base">Games</span><span className="text-brand-600 dark:text-brand-400">List</span>
      </>
    )
  }
  return <span className="text-fg-base">{BRAND.name}</span>
}
