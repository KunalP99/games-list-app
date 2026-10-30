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
];

/// Folders games actually install into.
const GAME_FOLDER_HINTS: &[&str] = &[
    "steamapps", "epic games", "gog galaxy", "gog games", "xboxgames",
    "ubisoft game launcher", "ea games", "origin games", "battle.net",
];

/// Graphics runtimes a 3D game loads and ordinary software generally does not.
const GRAPHICS_MODULES: &[&str] = &[
    "d3d11.dll", "d3d12.dll", "d3d9.dll", "dxgi.dll", "vulkan-1.dll", "opengl32.dll",
];

/// A program must be up this long before we will ask about it — installers,
/// updaters and one-off tools rarely stay open.
const MIN_RUN_TIME_SECS: u64 = 180;

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

/// Remembers which processes have already been judged.
///
/// The last gate walks a process's loaded modules, which means opening a
/// Toolhelp32 snapshot. That is fine once, but the loop polls every ten
/// seconds and would otherwise re-walk the same long-running programs forever.
/// A verdict for a given process cannot change, so it is kept.
#[derive(Default)]
pub struct GameJudge {
    /// pid -> (exe name, verdict). The exe name guards against the OS reusing
    /// a pid for a different program.
    verdicts: HashMap<u32, (String, bool)>,
}

impl GameJudge {
    pub fn judge(&mut self, candidate: &Candidate) -> bool {
        self.judge_with(candidate, loads_graphics_runtime)
    }

    fn judge_with(&mut self, candidate: &Candidate, modules: impl FnMut(u32) -> bool) -> bool {
        if let Some((exe, verdict)) = self.verdicts.get(&candidate.pid) {
            if exe == &candidate.exe_name {
                return *verdict;
            }
        }
        let verdict = looks_like_game_with(candidate, modules);
        self.verdicts.insert(candidate.pid, (candidate.exe_name.clone(), verdict));
        verdict
    }

    /// Drop processes that have exited, so the map cannot grow without bound.
    pub fn retain_running(&mut self, alive: &HashSet<u32>) {
        self.verdicts.retain(|pid, _| alive.contains(pid));
    }
}

/// Is this worth interrupting the user about?
///
/// Deliberately conservative: it would rather miss a game — which the user can
/// link from the website whenever they like — than prompt about a spreadsheet.
/// Every gate here earned its place; the Windows-directory one in particular,
/// because `TextInputHost` loads `dxgi.dll` and was the single false positive
/// when this was tested against every windowed app on a real desktop.
fn looks_like_game_with(c: &Candidate, mut modules: impl FnMut(u32) -> bool) -> bool {
    if !c.has_window {
        return false;
    }
    if IGNORED.contains(&c.exe_name.as_str()) {
        return false;
    }
    if c.run_time_secs < MIN_RUN_TIME_SECS {
        return false;
    }

    // No readable path means we cannot vouch for it, so we stay quiet.
    let Some(path) = c.path.as_deref() else {
        return false;
    };

    if let Some(windows_dir) = std::env::var_os("SystemRoot") {
        let windows_dir = windows_dir.to_string_lossy().to_lowercase();
        if path.starts_with(&windows_dir) {
            return false;
        }
    }

    if GAME_FOLDER_HINTS.iter().any(|hint| path.contains(hint)) {
        return true;
    }

    // Only reached once everything above has passed, so the cost of walking a
    // process's modules is paid rarely — and GameJudge then remembers the
    // answer, so a long-running program is never walked twice.
    modules(c.pid)
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
    fn known_software_is_never_asked_about() {
        let c = candidate("chrome.exe", Some("c:\\program files\\google\\chrome\\chrome.exe"), 9000, true);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn a_background_process_with_no_window_is_ignored() {
        let c = candidate("someservice.exe", Some("c:\\tools\\someservice.exe"), 9000, false);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }

    #[test]
    fn something_just_launched_is_given_time_to_settle() {
        let c = candidate("setup.exe", Some("d:\\steamapps\\common\\x\\setup.exe"), 10, true);
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
    fn a_process_with_no_path_is_left_alone() {
        let c = candidate("mystery.exe", None, 9000, true);
        assert!(!GameJudge::default().judge_with(&c, |_| false));
    }
}
