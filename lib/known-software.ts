// Programs that are plainly not games.
//
// The desktop agent keeps its own copy of this list in Rust (detect.rs) for
// deciding what to *ask* about. This one exists for the website, where an
// executable can be typed in by hand and nothing stops someone linking their
// browser to a game — which then silently logs browsing as play time.
//
// It is a warning, never a block: an unrecognised launcher or a game that
// happens to share a name should still be linkable.

const KNOWN_SOFTWARE: Record<string, string> = {
  'chrome.exe': 'web browser',
  'msedge.exe': 'web browser',
  'firefox.exe': 'web browser',
  'brave.exe': 'web browser',
  'opera.exe': 'web browser',
  'explorer.exe': 'part of Windows',
  'notepad.exe': 'text editor',
  'notepad++.exe': 'text editor',
  'code.exe': 'code editor',
  'devenv.exe': 'code editor',
  'discord.exe': 'chat app',
  'slack.exe': 'chat app',
  'teams.exe': 'chat app',
  'telegram.exe': 'chat app',
  'whatsapp.exe': 'chat app',
  'spotify.exe': 'music player',
  'vlc.exe': 'media player',
  'steam.exe': 'game launcher, not a game',
  'steamwebhelper.exe': 'part of Steam',
  'epicgameslauncher.exe': 'game launcher, not a game',
  'galaxyclient.exe': 'game launcher, not a game',
  'battle.net.exe': 'game launcher, not a game',
  'ubisoftconnect.exe': 'game launcher, not a game',
  'eadesktop.exe': 'game launcher, not a game',
  'origin.exe': 'game launcher, not a game',
  'obs64.exe': 'streaming software',
  'obs32.exe': 'streaming software',
  'excel.exe': 'spreadsheet app',
  'winword.exe': 'word processor',
  'powerpnt.exe': 'presentation app',
  'outlook.exe': 'email client',
  'acrobat.exe': 'PDF reader',
  'photoshop.exe': 'image editor',
  'figma.exe': 'design tool',
  'zoom.exe': 'video calls',
  'taskmgr.exe': 'part of Windows',
  'systemsettings.exe': 'part of Windows',
  'textinputhost.exe': 'part of Windows',
}

/**
 * What this executable is, if it is recognisably not a game.
 *
 * Returns null for anything unrecognised — which includes every real game, so
 * the absence of a warning means nothing either way.
 */
export function describeKnownSoftware(exeName: string): string | null {
  const name = exeName.trim().toLowerCase()
  return KNOWN_SOFTWARE[name] ?? null
}
