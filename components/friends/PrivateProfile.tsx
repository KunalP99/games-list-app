import PersonAvatar from './PersonAvatar'

/**
 * What a profile shows someone its owner keeps it from (Settings → Privacy →
 * Profile set to Friends or Only me): just who it is, and the way to become
 * friends. Nothing else of theirs is loaded.
 */
export default function PrivateProfile({
  name,
  username,
  accentColour,
  friendButton,
}: {
  name: string
  username: string
  accentColour: string | null
  friendButton: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-edge-base bg-surface-base px-6 py-10 text-center">
      <div className="flex justify-center">
        <PersonAvatar name={name} accentColour={accentColour} size={72} />
      </div>
      <h1 className="mt-4 text-xl font-bold text-fg-base break-words">{name}</h1>
      <p className="text-sm text-fg-muted">@{username}</p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-surface-sunken px-3 py-1.5 text-sm text-fg-secondary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        This profile is private
      </div>
      <p className="mt-3 text-sm text-fg-muted">Become friends to see their games, stats and activity.</p>
      {friendButton && <div className="mt-5 flex justify-center">{friendButton}</div>}
    </div>
  )
}
