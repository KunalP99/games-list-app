// Executable names too generic to safely mean one specific game, globally.
//
// The desktop agent keeps its own copies of these for deciding what to *ask*
// about (`matching.rs`'s GENERIC, `detect.rs`'s NOT_THE_GAME). This one
// exists for the admin "add a global exe link" page, where a name this
// generic — `game.exe`, every Unreal project's default `ShooterGame.exe`,
// an installer stub — would wrongly claim a specific title for every user
// who happens to run something sharing that name, not just the one game the
// admin actually means.
//
// A warning, never a block: an admin who genuinely means a generic-looking
// name (unlikely, but not impossible) can still save it.

const GENERIC: ReadonlySet<string> = new Set([
  'game', 'shootergame', 'main', 'application', 'program', 'setup', 'launch',
])

const NOT_THE_GAME_PARTS: readonly string[] = [
  'setup', 'install', 'unins', 'redist', 'vcredist', 'directx', 'dxsetup', 'dotnet',
  'crashhandler', 'crashreport', 'launcher_installer', 'updater', 'patcher', 'repair',
]

export function isGenericExecutableName(exeName: string): boolean {
  const base = exeName.trim().toLowerCase().replace(/\.exe$/, '')
  if (!base) return false
  if (GENERIC.has(base)) return true
  return NOT_THE_GAME_PARTS.some(part => base.includes(part))
}
