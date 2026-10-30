/**
 * The app's theme and accent, applied from a status payload.
 *
 * Shared by the status screen and the toast: both have to be in the user's own
 * accent colour, and the brand stops come from the server (computed by
 * lib/accent.ts, the same function the website uses) rather than being
 * approximated here.
 */
export function applyTheme(status) {
  const root = document.documentElement
  for (const [stop, rgb] of Object.entries(status?.palette ?? {})) {
    root.style.setProperty(`--brand-${stop}`, rgb.join(' '))
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = status?.theme === 'system' ? (prefersDark ? 'dark' : 'light') : status?.theme
  if (theme) root.setAttribute('data-theme', theme)
}
