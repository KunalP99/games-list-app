import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const REPO = 'KunalP99/games-list-app'

/**
 * The desktop app's "Download" button, on a URL that never changes.
 *
 * A link straight to a specific release's installer goes stale the moment a
 * newer one ships — the filename itself carries the version
 * (`GamesList_0.2.0_x64-setup.exe`). So instead this asks GitHub for
 * whichever release is actually latest right now and redirects straight to
 * its installer; cutting a new release is enough to keep this working, no
 * second place to remember to update.
 */
export async function GET() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    return new NextResponse('No desktop app release is available yet.', { status: 404 })
  }

  const release = await res.json()
  // The installer, not its .sig signature or the updater's latest.json —
  // both are real release assets sitting right next to it.
  const installer = (release.assets ?? []).find((a: { name: string }) => a.name.endsWith('.exe'))

  if (!installer) {
    return new NextResponse('No desktop app installer found on the latest release.', { status: 404 })
  }

  return NextResponse.redirect(installer.browser_download_url)
}
