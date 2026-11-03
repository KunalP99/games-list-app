//! Working out which game, if any, is running.
//!
//! Two jobs. Recognising a game we already know about (a Steam app id, or an
//! executable the user has linked), and deciding whether an *unknown* process
//! is worth asking about at all. The second is the one that has to be right:
//! a program that asks "is this a game?" every time anything opens is worse
//! than useless.

use std::collections::{HashMap, HashSet};
use sysinfo::{ProcessRefreshKind, RefreshKind, System};

/// A running program we might care about.
#[derive(Debug, Clone)]
pub struct Candidate {
    pub pid: u32,
    /// Lowercased executable name, e.g. "splitfiction.exe".
    pub exe_name: String,
    pub path: Option<String>,
    pub run_time_secs: u64,
    pub has_window: bool,
}

/// Programs that are never games, so the prompt stays away from everyday
/// software. Mirrors the list in the PowerShell prototype.
const IGNORED: &[&str] = &[
    "explorer.exe", "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe",
    "code.exe", "devenv.exe", "powershell.exe", "pwsh.exe", "windowsterminal.exe", "cmd.exe",
    "conhost.exe", "discord.exe", "slack.exe", "teams.exe", "spotify.exe", "whatsapp.exe",
    "telegram.exe", "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe",
    "galaxyclient.exe", "battle.net.exe", "ubisoftconnect.exe", "eadesktop.exe", "origin.exe",
    "obs64.exe", "obs32.exe", "notepad.exe", "notepad++.exe", "taskmgr.exe", "searchhost.exe",
    "onedrive.exe", "shellexperiencehost.exe", "applicationframehost.exe", "systemsettings.exe",
    "photoshop.exe", "illustrator.exe", "figma.exe", "outlook.exe", "excel.exe", "winword.exe",
    "powerpnt.exe", "acrobat.exe", "zoom.exe", "vlc.exe", "textinputhost.exe",
    // More launchers. These matter more now the question comes seconds after a
    // launch rather than minutes: starting a game often puts its launcher on
    // screen first, and that is the wrong thing to be asked about — worse, say
    // yes and every minute the launcher is open counts as play time.
    "rockstarlauncher.exe", "riotclientservices.exe", "riotclientux.exe", "leagueclient.exe",
    // The Riot Games launcher's own visible process, confirmed live as
    // `riot client.exe` (not `riot.exe` — a real, unrelated game ships that
    // one, "RIOT: Civil Unrest", so it stays identifiable and off this list).
    // This is the exact bug that motivated the exe-catalog ambiguity check
    // in tracker.rs, except this specific collision isn't something that
    // check alone can catch: the catalog's own `riot.exe` row is perfectly
    // unambiguous on its own, so without excluding the launcher's real exe
    // name here it would still get confidently auto-linked to a game it has
    // nothing to do with. Launcher exes always win here regardless of what
    // any catalog says.
    "riot client.exe",
    "bethesdanetlauncher.exe", "amazongameslauncher.exe", "minecraftlauncher.exe",
    "itch.exe", "playnite.desktopapp.exe", "heroic.exe", "legendary.exe", "gameoverlayui.exe",
];

/// Folders games actually install into.
///
/// "roberts space industries" earned its place live: Star Citizen's own
/// `StarCitizen.exe` (an 11GB+ working set) came back with no graphics
/// module Toolhelp32Snapshot could see — large or heavily-instrumented
/// processes are exactly where that enumeration gets unreliable — so without
/// a folder hint of its own, it fell all the way through to "not a game",
/// cached, with no second chance.
const GAME_FOLDER_HINTS: &[&str] = &[
    "steamapps", "epic games", "gog galaxy", "gog games", "xboxgames",
    "ubisoft game launcher", "ea games", "origin games", "battle.net",
    "roberts space industries",
];

/// Graphics runtimes a 3D game loads and ordinary software generally does not.
const GRAPHICS_MODULES: &[&str] = &[
    "d3d11.dll", "d3d12.dll", "d3d9.dll", "dxgi.dll", "vulkan-1.dll", "opengl32.dll",
];

/// A program must be up this long before we will ask about it.
///
/// Short enough to read as "when the game opened" — with a ten-second poll the
/// question lands twenty to thirty seconds in, while a game is still on its
/// loading screen. Long enough that the splash screens and redistributable
/// installers which flash past during a launch are gone before anything is
/// asked.
const MIN_RUN_TIME_SECS: u64 = 20;

/// After this long with no graphics module loaded, the module probe is
/// throttled rather than run on every single poll — see
/// `RECHECK_INTERVAL_SECS`.
///
/// A game loads its graphics runtime while it starts, so "no 3D modules yet"
/// a few seconds in means nothing — and nor does it minutes in: confirmed
/// live with a private World of Warcraft server client that sits on its
/// login and character-select screens well past this mark before ever
/// loading `d3d11.dll`. This used to be a flat cutoff that gave up and wrote
/// the process off as "not a game" forever once it elapsed; it no longer
/// does, since that meant exactly this kind of slow-starting game could
/// never be recognised, however long it kept running.
const SETTLES_AFTER_SECS: u64 = 120;

/// Once a candidate is past `SETTLES_AFTER_SECS`, how long to wait before
/// walking its modules again.
///
/// The module probe means opening a Toolhelp32 snapshot; re-running that on
/// every ten-second poll for the rest of a long-running program's life, on
/// the chance it eventually turns out to be a game, is real, recurring cost
/// for something that's usually just ordinary software. Throttling it keeps
/// that cost small and bounded, rather than solving the same problem the old
/// cutoff did by giving up on a real answer altogether.
const RECHECK_INTERVAL_SECS: u64 = 60;

/// Names that are part of installing or repairing a game rather than playing
/// one. They sit in the same folders games do and load the same graphics
/// runtimes, so nothing else here separates them — and now that the question
/// comes seconds after launch rather than minutes, they are what would be in
/// front of the user instead of the game.
const NOT_THE_GAME: &[&str] = &[
    "setup", "install", "unins", "redist", "vcredist", "directx", "dxsetup", "dotnet",
    "crashhandler", "crashreport", "launcher_installer", "updater", "patcher", "repair",
];

pub fn new_system() -> System {
    System::new_with_specifics(RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()))
}

/// Every running program that has a visible window.
pub fn candidates(sys: &mut System) -> Vec<Candidate> {
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let windowed = visible_window_pids();

    sys.processes()
        .iter()
        .filter_map(|(pid, proc_)| {
            let exe_name = proc_.name().to_string_lossy().to_lowercase();
            if exe_name.is_empty() {
                return None;
            }
            let pid_u32 = pid.as_u32();
            Some(Candidate {
                pid: pid_u32,
                exe_name,
                path: proc_.exe().map(|p| p.to_string_lossy().to_lowercase()),
                run_time_secs: proc_.run_time(),
                has_window: windowed.contains(&pid_u32),
            })
        })
        .collect()
}

/// Programs worth offering when the user links a game by hand.
///
/// Looser than `looks_like_game`: the user is telling us what it is, so we do
/// not need to be sure it is a game — only to keep the list short enough to
/// scan, which means a visible window and not obviously everyday software.
pub fn pickable(c: &Candidate) -> bool {
    if !c.has_window || IGNORED.contains(&c.exe_name.as_str()) {
        return false;
    }
    match c.path.as_deref() {
        // Windows' own components are never what the user means.
        Some(path) => match std::env::var_os("SystemRoot") {
            Some(dir) => !path.starts_with(&dir.to_string_lossy().to_lowercase()),
            None => true,
        },
        // No path is not itself a reason to hide something — confirmed live,
        // a real running game (Star Citizen's own StarCitizen.exe) can have
        // one unreadable by every method tried (sysinfo, WMI, .NET's own
        // Process class all come back empty), which used to mean it could
        // not even be picked here by hand — the one fallback this list exists
        // to offer once nothing else can identify a program automatically.
        None => true,
    }
}

/// What we make of a process, and whether that can still change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verdict {
    Game,
    NotAGame,
    /// Too soon to say — ask again on the next poll.
    NotYet,
}

/// Remembers which processes have already been judged.
///
/// The last gate walks a process's loaded modules, which means opening a
/// Toolhelp32 snapshot. That is fine once, but the loop polls every ten
/// seconds and would otherwise re-walk the same long-running programs forever.
///
/// Only *settled* verdicts are kept. Caching every answer looked right — a
/// program is a game or it is not — but two of the gates are about time, not
/// identity: a process younger than `MIN_RUN_TIME_SECS`, and one that has not
/// loaded its graphics runtime yet. Keeping those answers meant a game was
/// written off at first sight, seconds after launching, and never looked at
/// again. The three-minute settle therefore never elapsed for anything; it
/// just silenced the prompt. The same reasoning now also applies past
/// `SETTLES_AFTER_SECS`: a module probe that still hasn't found a graphics
/// runtime is throttled (`last_probed_at`), not settled as a permanent "no".
#[derive(Default)]
pub struct GameJudge {
    /// pid -> (exe name, verdict). The exe name guards against the OS reusing
    /// a pid for a different program.
    verdicts: HashMap<u32, (String, bool)>,
    /// pid -> the candidate's `run_time_secs` the last time its modules were
    /// actually walked, once it's old enough that the probe is throttled
    /// rather than run on every poll. Keyed on the candidate's own run time
    /// rather than wall-clock time, so the next probe is determined purely by
    /// how long the process has been running, not by when the app happens to
    /// poll it.
    last_probed_at: HashMap<u32, u64>,
}

impl GameJudge {
    pub fn judge(&mut self, candidate: &Candidate) -> bool {
        self.judge_with(candidate, loads_graphics_runtime)
    }

    fn judge_with(&mut self, candidate: &Candidate, mut modules: impl FnMut(u32) -> bool) -> bool {
        if let Some((exe, verdict)) = self.verdicts.get(&candidate.pid) {
            if exe == &candidate.exe_name {
                return *verdict;
            }
        }

        let due_to_probe = candidate.run_time_secs < SETTLES_AFTER_SECS
            || self.last_probed_at.get(&candidate.pid).is_none_or(|&t| {
                candidate.run_time_secs.saturating_sub(t) >= RECHECK_INTERVAL_SECS
            });

        match looks_like_game_with(candidate, due_to_probe, &mut modules) {
            // Still starting up, or past the settle window with nothing
            // conclusive yet: decide next time round rather than writing it
            // off for the life of the process.
            Verdict::NotYet => {
                if candidate.run_time_secs >= SETTLES_AFTER_SECS && due_to_probe {
                    self.last_probed_at.insert(candidate.pid, candidate.run_time_secs);
                }
                false
            }
            settled => {
                let verdict = settled == Verdict::Game;
                self.verdicts.insert(candidate.pid, (candidate.exe_name.clone(), verdict));
                verdict
            }
        }
    }

    /// Drop processes that have exited, so the maps cannot grow without bound.
    pub fn retain_running(&mut self, alive: &HashSet<u32>) {
        self.verdicts.retain(|pid, _| alive.contains(pid));
        self.last_probed_at.retain(|pid, _| alive.contains(pid));
    }
}

/// The identity-only gates: everything that is instantly true or false about
/// a process regardless of how long it has been running or what it has
/// loaded. Shared by [`looks_like_game_with`] and [`plausible_candidate`],
/// which only adds an age gate on top of this.
fn is_not_obviously_excluded(c: &Candidate) -> bool {
    if !c.has_window {
        return false;
    }
    if IGNORED.contains(&c.exe_name.as_str()) {
        return false;
    }
    // An installer sits in the game's own folder and loads the same graphics
    // runtime, so no later gate would tell them apart.
    if NOT_THE_GAME.iter().any(|part| c.exe_name.contains(part)) {
        return false;
    }

    // A path lets some later gates run, but its absence is not itself
    // suspicious — a real running game can have one unreadable by every
    // method tried (confirmed live, if intermittently: sysinfo, WMI and
    // .NET's own `Process` class all came back empty for Star Citizen's own
    // `StarCitizen.exe` on one run), which used to mean it was written off
    // immediately, with no fallback at all since the gates below it never
    // ran either. Everything they'd have caught is still caught on its own
    // merits further down.
    if let Some(path) = c.path.as_deref() {
        if let Some(windows_dir) = std::env::var_os("SystemRoot") {
            let windows_dir = windows_dir.to_string_lossy().to_lowercase();
            if path.starts_with(&windows_dir) {
                return false;
            }
        }
    }

    true
}

/// Worth checking against the master list (`master_list.rs`), regardless of
/// whether the local heuristic below can confirm it is a game on its own.
///
/// Deliberately looser than [`looks_like_game_with`]: it skips the
/// folder-hint and module-probe checks entirely and just rules out what
/// plainly is not worth a network round-trip (everyday software, installers,
/// anything inside the Windows folder, anything too young to have finished
/// launching), leaving the rest to the list's own answer. This exists
/// because a real game can actively block the two signals the full judge
/// depends on — confirmed live against Dead by Daylight, whose anti-cheat
/// makes both its install path *and* its loaded modules unreadable, so the
/// judge never settles on `Game` and the list would otherwise never even be
/// consulted. A miss here just means "not on the list yet", the same as it
/// already did for a judge-confirmed game — not a "this is not a game"
/// verdict of any kind.
pub fn plausible_candidate(c: &Candidate) -> bool {
    is_not_obviously_excluded(c) && c.run_time_secs >= MIN_RUN_TIME_SECS
}

/// Is this worth interrupting the user about?
///
/// Deliberately conservative: it would rather miss a game — which the user can
/// link from the website whenever they like — than prompt about a spreadsheet.
/// Every gate here earned its place; the Windows-directory one in particular,
/// because `TextInputHost` loads `dxgi.dll` and was the single false positive
/// when this was tested against every windowed app on a real desktop.
///
/// `due_to_probe` gates the one gate that costs real time to check (walking
/// a process's modules) — see `RECHECK_INTERVAL_SECS`. When it's false, the
/// probe is skipped and this returns `NotYet` without an opinion either way,
/// exactly as if the probe had been run and had not (yet) found anything.
fn looks_like_game_with(c: &Candidate, due_to_probe: bool, mut modules: impl FnMut(u32) -> bool) -> Verdict {
    if !is_not_obviously_excluded(c) {
        return Verdict::NotAGame;
    }

    // Everything above is about what a program *is*, and settles immediately.
    // Everything below is about how far into starting up it has got.
    if c.run_time_secs < MIN_RUN_TIME_SECS {
        return Verdict::NotYet;
    }

    if let Some(path) = c.path.as_deref() {
        if GAME_FOLDER_HINTS.iter().any(|hint| path.contains(hint)) {
            return Verdict::Game;
        }
    }

    // Only reached once everything above has passed, so the cost of walking a
    // process's modules is paid rarely — a settled `Game` verdict is
    // remembered permanently, and once past `SETTLES_AFTER_SECS` the probe
    // itself is throttled (`due_to_probe`) rather than skipped forever, so a
    // slow-starting game still gets found eventually instead of being
    // written off the moment the clock runs out.
    if due_to_probe && modules(c.pid) {
        return Verdict::Game;
    }
    // It may still be loading its graphics runtime — or, past the settle
    // window, just hasn't been due for a re-check this tick. Either way,
    // there's no verdict yet, never a settled "no" purely from time.
    Verdict::NotYet
}

// ── Windows specifics ───────────────────────────────────────────────────────

#[cfg(windows)]
fn visible_window_pids() -> HashSet<u32> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
    };

    unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            // A window with no title is usually a hidden message-only window,
            // not something the user is looking at.
            if IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
                let mut pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid != 0 {
                    let set = &mut *(lparam.0 as *mut HashSet<u32>);
                    set.insert(pid);
                }
            }
        }
        BOOL(1)
    }

    let mut pids: HashSet<u32> = HashSet::new();
    unsafe {
        let _ = EnumWindows(Some(callback), LPARAM(&mut pids as *mut _ as isize));
    }
    pids
}

#[cfg(not(windows))]
fn visible_window_pids() -> HashSet<u32> {
    HashSet::new()
}

#[cfg(windows)]
fn loads_graphics_runtime(pid: u32) -> bool {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, MODULEENTRY32W,
        TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32,
    };

    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid)
        else {
            return false;
        };

        let mut entry = MODULEENTRY32W {
            dwSize: std::mem::size_of::<MODULEENTRY32W>() as u32,
            ..Default::default()
        };

        let mut found = false;
        if Module32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let name = String::from_utf16_lossy(
                    &entry.szModule[..entry
                        .szModule
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szModule.len())],
                )
                .to_lowercase();

                if GRAPHICS_MODULES.contains(&name.as_str()) {
                    found = true;
                    break;
                }
                if Module32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = windows::Win32::Foundation::CloseHandle(snapshot);
        found
    }
}

#[cfg(not(windows))]
fn loads_graphics_runtime(_pid: u32) -> bool {
    false
}

/// The Steam app id of whatever Steam is currently running, if anything.
///
/// This single registry value is why Steam games need no setup at all: it is
/// authoritative, instant, and matches straight onto `games.steam_appid`.
#[cfg(windows)]
pub fn steam_running_app_id() -> Option<u32> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let steam = hkcu.open_subkey("Software\\Valve\\Steam").ok()?;
    let app_id: u32 = steam.get_value("RunningAppID").ok()?;
    if app_id > 0 { Some(app_id) } else { None }
}

#[cfg(not(windows))]
pub fn steam_running_app_id() -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(name: &str, path: Option<&str>, secs: u64, window: bool) -> Candidate {
        Candidate {
            pid: 1234,
            exe_name: name.to_string(),
            path: path.map(|p| p.to_string()),
            run_time_secs: secs,
            has_window: window,
        }
    }

    #[test]
    fn a_game_in_a_steam_folder_is_recognised() {
        let c = candidate("hades.exe", Some("d:\\steamlibrary\\steamapps\\common\\hades\\hades.exe"), 600, true);
        assert!(GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn a_game_in_an_rsi_folder_is_recognised_even_if_the_module_probe_lies() {
        // The actual bug this guards against: Star Citizen's own
        // StarCitizen.exe (confirmed live, an 11GB+ working set) can come
        // back with no graphics module Toolhelp32Snapshot could see, well
        // past the settle window — large processes are exactly where that
        // enumeration gets unreliable. The folder hint means this never has
        // to depend on the module probe being right.
        let c = candidate(
            "starcitizen.exe",
            Some(r"c:\program files\roberts space industries\starcitizen\live\bin64\starcitizen.exe"),
            600,
            true,
        );
        assert!(GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn known_software_is_never_asked_about() {
        let c = candidate("chrome.exe", Some("c:\\program files\\google\\chrome\\chrome.exe"), 9000, true);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn the_riot_launcher_is_never_asked_about() {
        // Confirmed live: the Riot Games launcher's own visible process runs
        // as "riot client.exe", a distinct name from riot.exe — which a
        // real, unrelated game ("RIOT: Civil Unrest") ships, and which stays
        // identifiable precisely because it is *not* on this list. The
        // exe-catalog's own ambiguity check can't catch the launcher's own
        // collision risk (its real exe name isn't in the catalog at all),
        // so it has to be excluded here, unconditionally.
        let c = candidate("riot client.exe", Some("c:\\riot games\\riot client\\riot client.exe"), 9000, true);
        assert!(!GameJudge::default().judge_with(&c, |_| true));
    }

    #[test]
    fn riotexe_itself_is_still_a_recognisable_game_not_a_blocked_launcher() {
        // The actual game that exe name belongs to must stay recognisable —
        // only the launcher's own distinct exe name is excluded above.
        let c = candidate("riot.exe", Some("c:\\games\\riot civil unrest\\riot.exe"), 9000, true);
        assert!(GameJudge::default().judge_with(&c, |_| true));
    }

    #[test]
    fn a_background_process_with_no_window_is_ignored() {
        let c = candidate("someservice.exe", Some("c:\\tools\\someservice.exe"), 9000, false);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn a_game_is_asked_about_once_it_has_settled_not_minutes_later() {
        // Twenty seconds, so with a ten-second poll the question arrives while
        // the game is still loading rather than three minutes into play.
        let path = "d:\\steamlibrary\\steamapps\\common\\hades\\hades.exe";
        let mut judge = GameJudge::default();
        assert!(!judge.judge_with(&candidate("hades.exe", Some(path), 5, true), |_| false));
        assert!(judge.judge_with(&candidate("hades.exe", Some(path), 25, true), |_| false));
    }

    #[test]
    fn a_process_judged_too_early_is_judged_again() {
        // The bug this guards: caching "no" from the age gate meant a game was
        // written off seconds after launching and never looked at again, so
        // the settle period never actually elapsed for anything.
        let path = "d:\\steamlibrary\\steamapps\\common\\hades\\hades.exe";
        let mut judge = GameJudge::default();
        judge.judge_with(&candidate("hades.exe", Some(path), 1, true), |_| false);
        assert!(
            judge.verdicts.is_empty(),
            "nothing should be remembered about a process still starting up",
        );
        assert!(judge.judge_with(&candidate("hades.exe", Some(path), 600, true), |_| false));
    }

    #[test]
    fn a_game_that_has_not_loaded_its_graphics_runtime_yet_gets_another_look() {
        // Outside a known games folder, so the modules are the only evidence —
        // and a game loads them while it starts.
        let c = candidate("mygame.exe", Some("d:\\games\\mygame\\mygame.exe"), 30, true);
        let mut judge = GameJudge::default();
        assert!(!judge.judge_with(&c, |_| false));
        assert!(judge.verdicts.is_empty(), "still young, so not written off");
        assert!(judge.judge_with(&c, |_| true), "the runtime has loaded by now");
    }

    #[test]
    fn a_program_past_the_settle_window_has_its_module_probe_throttled_not_abandoned() {
        // The bug this guards against: a flat cutoff at SETTLES_AFTER_SECS
        // used to write a process off as "not a game" forever the moment it
        // crossed that mark with no graphics module loaded yet — confirmed
        // live against a private World of Warcraft server client that sits
        // on its login/character-select screens well past two minutes
        // before ever loading d3d11.dll. It must keep being re-checked,
        // just throttled rather than on every single poll.
        let path = "d:\\apps\\someapp\\someapp.exe";
        let mut judge = GameJudge::default();
        let mut walks = 0;

        let old_enough = candidate("someapp.exe", Some(path), 600, true);
        assert!(!judge.judge_with(&old_enough, |_| {
            walks += 1;
            false
        }));
        assert!(judge.verdicts.is_empty(), "no verdict yet, not written off permanently");
        assert_eq!(walks, 1);

        // Still the same age: inside the throttle window, so the module walk
        // is skipped rather than repeated.
        assert!(!judge.judge_with(&old_enough, |_| {
            walks += 1;
            false
        }));
        assert_eq!(walks, 1, "should not re-walk modules inside the throttle window");

        // Old enough now that the throttle window has passed — and this
        // time its renderer has actually loaded.
        let later = candidate("someapp.exe", Some(path), 600 + RECHECK_INTERVAL_SECS, true);
        assert!(judge.judge_with(&later, |_| {
            walks += 1;
            true
        }));
        assert_eq!(walks, 2);
        assert!(judge.verdicts.get(&later.pid).is_some(), "now settled as a real game");
    }

    #[test]
    fn an_installer_in_a_game_folder_is_not_the_game() {
        // Sits in steamapps and loads the same runtimes, so only the name
        // separates it — and with a short settle it is what would be on
        // screen instead of the game.
        for name in ["easyanticheat_setup.exe", "vcredist_x64.exe", "unins000.exe"] {
            let path = format!("d:\\steamlibrary\\steamapps\\common\\game\\{name}");
            let c = candidate(name, Some(&path), 600, true);
            assert!(!GameJudge::default().judge_with(&c, |_| true), "{name}");
        }
    }

    #[test]
    fn something_just_launched_is_given_time_to_settle() {
        // A plain name, so this tests the age gate rather than passing
        // because NOT_THE_GAME caught "setup" on the way past.
        let c = candidate("thing.exe", Some("d:\\steamapps\\common\\x\\thing.exe"), 10, true);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn a_process_is_only_examined_once() {
        // The module walk opens a Toolhelp32 snapshot; at one poll every ten
        // seconds, re-walking the same long-running game would be pure waste.
        let c = candidate("mygame.exe", Some("d:/games/mygame/mygame.exe"), 600, true);
        let mut judge = GameJudge::default();
        let mut walks = 0;

        for _ in 0..5 {
            judge.judge_with(&c, |_| {
                walks += 1;
                true
            });
        }
        assert_eq!(walks, 1, "should have consulted the modules once, not once per poll");
    }

    #[test]
    fn a_reused_pid_running_something_else_is_judged_again() {
        // Windows reuses pids, so the verdict is keyed on the executable too.
        let mut judge = GameJudge::default();
        let game = candidate("mygame.exe", Some("d:/games/mygame/mygame.exe"), 600, true);
        let other = Candidate { exe_name: "other.exe".into(), ..game.clone() };

        let mut walks = 0;
        judge.judge_with(&game, |_| { walks += 1; true });
        judge.judge_with(&other, |_| { walks += 1; true });
        assert_eq!(walks, 2);
    }

    #[test]
    fn processes_that_have_exited_are_forgotten() {
        let c = candidate("mygame.exe", Some("d:/games/mygame/mygame.exe"), 600, true);
        let mut judge = GameJudge::default();
        judge.judge_with(&c, |_| true);

        judge.retain_running(&HashSet::from([c.pid]));
        assert_eq!(judge.verdicts.len(), 1, "still running, so still remembered");

        judge.retain_running(&HashSet::new());
        assert!(judge.verdicts.is_empty(), "gone, so the entry should be dropped");
    }

    #[test]
    fn a_process_with_no_path_and_no_graphics_runtime_is_left_alone() {
        // Old enough to have settled, loads nothing — a pathless process is
        // not given any special pass; it still has to earn "Game" the same
        // way everything outside a hinted folder does.
        let c = candidate("mystery.exe", None, 9000, true);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn a_pathless_process_can_still_be_recognised_by_its_modules() {
        // The actual bug this guards against: a real running game can have an
        // unreadable path by every method tried (confirmed live against Star
        // Citizen's own StarCitizen.exe — sysinfo, WMI and .NET's own Process
        // class all come back empty for it), which used to mean an instant,
        // permanent "not a game" with no fallback, because the module check
        // was never even reached.
        let c = candidate("starcitizen.exe", None, 600, true);
        assert!(GameJudge::default().judge_with(&c, |_| true));
    }

    #[test]
    fn a_catalog_lookup_does_not_need_a_path_or_a_graphics_module() {
        // The actual bug this guards against: Dead by Daylight's anti-cheat
        // leaves both its install path and its loaded modules unreadable, so
        // the full judge never settles on "Game" — which used to mean the
        // global exe-link catalog, which needs neither of those things, was
        // never even asked, and a catalogued game still fell through to the
        // generic "is this a game?" toast on every user's PC.
        let c = candidate("deadbydaylight-win64-shipping.exe", None, 600, true);
        assert!(!GameJudge::default().judge_with(&c, |_| false), "judge has nothing to go on");
        assert!(plausible_candidate(&c), "but the catalog should still be asked");
    }

    #[test]
    fn a_catalog_lookup_still_skips_everyday_software_and_installers() {
        // Looser than the judge, not open season: there is no point spending
        // a network round-trip per poll on a browser or an installer.
        for (name, path) in [
            ("chrome.exe", "c:\\program files\\google\\chrome\\chrome.exe"),
            ("vcredist_x64.exe", "d:\\steamlibrary\\steamapps\\common\\game\\vcredist_x64.exe"),
        ] {
            assert!(!plausible_candidate(&candidate(name, Some(path), 600, true)), "{name}");
        }
        // Nor on something with no window, or that only just started.
        assert!(!plausible_candidate(&candidate("mygame.exe", None, 600, false)));
        assert!(!plausible_candidate(&candidate("mygame.exe", None, 5, true)));
    }

    #[test]
    fn a_pathless_process_is_pickable_by_hand() {
        // The other half of the same bug: unable to vouch for it
        // automatically, this is the one fallback that exists specifically
        // for that case — hiding it there too left no way to link it at all.
        let c = candidate("starcitizen.exe", None, 600, true);
        assert!(pickable(&c));
    }
}
