import { BRAND_PATHS } from '@/lib/platform-brand-paths'
import { platformIcon, type DrawnIcon } from '@/lib/platform-icons'

// A platform's icon, in the text colour around it (so it works in light and
// dark): a brand icon where Simple Icons has one, else a simple drawn device.

const DRAWN: Record<DrawnIcon, React.ReactNode> = {
  // A console with a controller either side of the screen.
  switch: <><rect x="2.5" y="6" width="19" height="12" rx="3.5" /><path d="M7 6v12M17 6v12" /><circle cx="4.9" cy="9.2" r="0.6" fill="currentColor" /><circle cx="19.1" cy="14.8" r="0.6" fill="currentColor" /></>,
  // A handheld with its screen at the top.
  handheld: <><rect x="6" y="2" width="12" height="20" rx="2" /><rect x="8.5" y="4.5" width="7" height="6" rx="0.8" /><path d="M9.5 14.5v3M8 16h3" /><circle cx="15" cy="15" r="0.8" fill="currentColor" /><circle cx="13.6" cy="17.2" r="0.8" fill="currentColor" /></>,
  // Two screens, one above the other.
  dual: <><rect x="5" y="2.5" width="14" height="8.5" rx="1.5" /><rect x="5" y="13" width="14" height="8.5" rx="1.5" /><path d="M8.5 17.2h2M9.5 16.2v2" /><circle cx="15.3" cy="17.2" r="0.7" fill="currentColor" /></>,
  // A motion remote.
  remote: <><rect x="8.5" y="2" width="7" height="20" rx="3.5" /><circle cx="12" cy="7" r="1.6" /><circle cx="12" cy="13" r="0.7" fill="currentColor" /><circle cx="12" cy="16" r="0.7" fill="currentColor" /></>,
  // A cube.
  cube: <><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z" /><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" /></>,
  // A controller.
  gamepad: <><path d="M7 6h10a4 4 0 0 1 3.9 3.2l1 5.3a3 3 0 0 1-5.3 2.4L15 15H9l-1.6 1.9a3 3 0 0 1-5.3-2.4l1-5.3A4 4 0 0 1 7 6Z" /><path d="M7 10v3M5.5 11.5h3" /><circle cx="16" cy="10.5" r="0.7" fill="currentColor" /><circle cx="17.5" cy="12.5" r="0.7" fill="currentColor" /></>,
  // Four panes.
  windows: <><rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" stroke="none" /><rect x="13" y="3" width="8" height="8" rx="1" fill="currentColor" stroke="none" /><rect x="3" y="13" width="8" height="8" rx="1" fill="currentColor" stroke="none" /><rect x="13" y="13" width="8" height="8" rx="1" fill="currentColor" stroke="none" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18.5h2" /></>,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18Z" />,
}

export default function PlatformIcon({ platform, className = 'h-5 w-5' }: { platform: string; className?: string }) {
  const icon = platformIcon(platform)
  if ('brand' in icon) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d={BRAND_PATHS[icon.brand]} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {DRAWN[icon.drawn]}
    </svg>
  )
}
