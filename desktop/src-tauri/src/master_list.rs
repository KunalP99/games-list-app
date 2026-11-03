//! The master list of detectable games, matched on this PC.
//!
//! The site serves a compact list of path endings (`tunic/tunic.exe`, about
//! 11k of them, seeded from Discord's own detection list plus admin-approved
//! rows). The tracker keeps a copy in `detectable.json` and matches running
//! programs against it locally, so only a *hit* is ever sent to the server —
//! never the list of everything the user runs. Offline, the cached copy keeps
//! working.
//!
//! Endings, not bare exe names: `game.exe` alone belongs to 190+ games, and
//! the folder is what tells them apart. See reviews/master-list-plan.md.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

const CACHE_FILE: &str = "detectable.json";

/// Folder names that say nothing about which game they belong to. Mirrors
/// `GENERIC_FOLDERS` in `lib/detectable.ts`.
const GENERIC_FOLDERS: &[&str] = &["bin", "binaries", "win64", "win32", "x64", "x86", "release", "retail", "content"];

/// Most segments a submitted ending may have. Mirrors `MAX_SUFFIX_SEGMENTS`.
const MAX_SEGMENTS: usize = 3;

/// The list exactly as the site sends it, and as it is cached on disk.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListFile {
    pub version: String,
    /// `[path_suffix, row id]` pairs.
    pub entries: Vec<(String, u64)>,
}

/// The list, indexed for matching.
#[derive(Debug, Default)]
pub struct MasterList {
    pub version: String,
    /// exe file name -> every (ending, row id) with that file name.
    by_name: HashMap<String, Vec<(String, u64)>>,
}

/// A running program found on the list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hit {
    pub id: u64,
    pub suffix: String,
}

/// Lowercase, forward slashes — the form list endings are stored in.
pub fn normalise(path: &str) -> String {
    path.to_lowercase().replace('\\', "/")
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

impl MasterList {
    pub fn from_file(file: ListFile) -> Self {
        let mut by_name: HashMap<String, Vec<(String, u64)>> = HashMap::new();
        for (suffix, id) in file.entries {
            let suffix = normalise(&suffix);
            by_name.entry(file_name(&suffix).to_string()).or_default().push((suffix, id));
        }
        Self { version: file.version, by_name }
    }

    pub fn len(&self) -> usize {
        self.by_name.values().map(Vec::len).sum()
    }

    /// The list entry for a running program, if any.
    ///
    /// `path` is the full path when known. An entry matches when the path
    /// *is* the ending or ends with `/` + the ending — so `hades.exe` matches
    /// `…/hades/hades.exe` but never `…/hades2.exe`. When several match, the
    /// longest (most specific) ending wins.
    ///
    /// Without a path (anti-cheat can hide it), only bare-name entries can
    /// match, by the exe name alone — anything with a folder needs the folder.
    pub fn find(&self, path: Option<&str>, exe_name: &str) -> Option<Hit> {
        let path = normalise(path.unwrap_or(exe_name));
        let candidates = self.by_name.get(file_name(&path))?;
        candidates
            .iter()
            .filter(|(suffix, _)| {
                path == *suffix
                    || (path.len() > suffix.len()
                        && path.ends_with(suffix.as_str())
                        && path.as_bytes()[path.len() - suffix.len() - 1] == b'/')
            })
            .max_by_key(|(suffix, _)| suffix.len())
            .map(|(suffix, id)| Hit { id: *id, suffix: suffix.clone() })
    }
}

/// The ending sent to the site when a user links or adds a game, for the
/// admin queue: the exe file name, plus parent folders one at a time until
/// the last one added says something (isn't `bin`, `win64`, …).
///
/// Privacy: never more than three segments, never a drive letter, and never
/// anything at or above a `users\<name>` folder. The full path stays on the PC.
pub fn path_suffix(full_path: &str) -> Option<String> {
    let path = normalise(full_path);
    let mut segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let exe = segments.pop()?;
    if !exe.ends_with(".exe") {
        return None;
    }
    let mut out = vec![exe];
    while out.len() < MAX_SEGMENTS {
        let Some(parent) = segments.pop() else { break };
        let is_drive = parent.len() == 2 && parent.ends_with(':');
        // `parent` is `users` itself, or the user's own folder directly under it.
        let is_user_folder = parent == "users" || segments.last() == Some(&"users");
        if is_drive || is_user_folder || parent == "?" || parent == "." {
            break;
        }
        out.insert(0, parent);
        if !GENERIC_FOLDERS.contains(&parent) {
            break;
        }
    }
    Some(out.join("/"))
}

/// The platform a game on the list is most likely being played through,
/// from where it is installed. Only a label for a newly filed game — the user
/// confirms it on the platform prompt either way.
pub fn platform_for_path(path: Option<&str>) -> &'static str {
    let Some(path) = path else { return "PC (Windows)" };
    let path = normalise(path);
    if path.contains("/steamapps/") {
        "Steam"
    } else if path.contains("/epic games/") {
        "Epic Games"
    } else if path.contains("/ea games/") {
        "EA App"
    } else {
        "PC (Windows)"
    }
}

pub fn load_cache(dir: &Path) -> Option<ListFile> {
    let text = std::fs::read_to_string(dir.join(CACHE_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save_cache(dir: &Path, file: &ListFile) {
    match serde_json::to_string(file) {
        Ok(text) => {
            if let Err(err) = std::fs::write(dir.join(CACHE_FILE), text) {
                log::warn!("could not cache the master list: {err}");
            }
        }
        Err(err) => log::warn!("could not serialise the master list: {err}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(entries: &[(&str, u64)]) -> MasterList {
        MasterList::from_file(ListFile {
            version: "1".into(),
            entries: entries.iter().map(|(s, id)| (s.to_string(), *id)).collect(),
        })
    }

    /// Built through the same normalisation the runtime uses (`detect.rs`
    /// lowercases every path), not hand-written lowercase strings.
    fn running(path: &str) -> (Option<String>, String) {
        let lower = path.to_lowercase();
        let exe = lower.rsplit(['\\', '/']).next().unwrap().to_string();
        (Some(lower), exe)
    }

    fn find(l: &MasterList, path: &str) -> Option<u64> {
        let (p, exe) = running(path);
        l.find(p.as_deref(), &exe).map(|h| h.id)
    }

    #[test]
    fn a_path_ending_with_the_entry_matches() {
        let l = list(&[("tunic/tunic.exe", 1)]);
        assert_eq!(find(&l, r"D:\SteamLibrary\steamapps\common\TUNIC\Tunic.exe"), Some(1));
    }

    #[test]
    fn a_different_folder_does_not_match() {
        let l = list(&[("tunic/tunic.exe", 1)]);
        assert_eq!(find(&l, r"C:\Games\NotTunic\Tunic.exe"), None);
    }

    #[test]
    fn hades_and_hades_ii_are_told_apart() {
        let l = list(&[("hades.exe", 1), ("ship/hades2.exe", 2)]);
        assert_eq!(find(&l, r"C:\Epic Games\Hades\Hades.exe"), Some(1));
        assert_eq!(find(&l, r"C:\Steam\steamapps\common\Hades II\Ship\Hades2.exe"), Some(2));
    }

    #[test]
    fn two_games_sharing_game_exe_match_by_folder() {
        let l = list(&[("star conflict/game.exe", 1), ("mirror/game.exe", 2)]);
        assert_eq!(find(&l, r"C:\Games\Star Conflict\game.exe"), Some(1));
        assert_eq!(find(&l, r"C:\Games\Mirror\game.exe"), Some(2));
        assert_eq!(find(&l, r"C:\Games\Something Else\game.exe"), None);
    }

    #[test]
    fn the_longest_matching_ending_wins() {
        let l = list(&[("cyberpunk2077.exe", 1), ("x64/cyberpunk2077.exe", 2)]);
        assert_eq!(find(&l, r"C:\Games\Cyberpunk 2077\bin\x64\Cyberpunk2077.exe"), Some(2));
        assert_eq!(find(&l, r"C:\Games\Cyberpunk2077.exe"), Some(1));
    }

    #[test]
    fn a_partial_folder_name_is_not_a_match() {
        // "…/mytunic/tunic.exe" ends with "tunic/tunic.exe" as text, but not on a folder boundary.
        let l = list(&[("tunic/tunic.exe", 1)]);
        assert_eq!(find(&l, r"C:\Games\MyTunic\Tunic.exe"), None);
    }

    #[test]
    fn without_a_path_only_bare_name_entries_can_match() {
        let l = list(&[("hades.exe", 1), ("tunic/tunic.exe", 2)]);
        assert_eq!(l.find(None, "hades.exe").map(|h| h.id), Some(1));
        assert_eq!(l.find(None, "tunic.exe"), None);
    }

    #[test]
    fn suffix_stops_at_the_first_telling_folder() {
        assert_eq!(path_suffix(r"D:\Games\TUNIC\Tunic.exe").as_deref(), Some("tunic/tunic.exe"));
    }

    #[test]
    fn suffix_climbs_past_generic_folders() {
        assert_eq!(
            path_suffix(r"C:\Games\Squad\SquadGame\Binaries\Win64\SquadGame.exe").as_deref(),
            Some("binaries/win64/squadgame.exe"),
        );
        assert_eq!(path_suffix(r"C:\Games\Hades II\Ship\x64\Hades2.exe").as_deref(), Some("ship/x64/hades2.exe"));
    }

    #[test]
    fn suffix_never_has_more_than_three_segments() {
        let s = path_suffix(r"C:\a\bin\bin\bin\bin\game.exe").unwrap();
        assert_eq!(s.split('/').count(), 3);
    }

    #[test]
    fn suffix_never_includes_a_drive_or_a_user_folder() {
        assert_eq!(path_suffix(r"C:\game.exe").as_deref(), Some("game.exe"));
        assert_eq!(path_suffix(r"C:\bin\game.exe").as_deref(), Some("bin/game.exe"));
        assert_eq!(path_suffix(r"C:\Users\Kunal\game.exe").as_deref(), Some("game.exe"));
        assert_eq!(path_suffix(r"C:\Users\Kunal\bin\game.exe").as_deref(), Some("bin/game.exe"));
        assert_eq!(path_suffix(r"\\?\C:\Win64\game.exe").as_deref(), Some("win64/game.exe"));
        let s = path_suffix(r"C:\Users\Kunal\AppData\Local\MyGame\MyGame.exe").unwrap();
        assert!(!s.contains("kunal") && !s.contains("users"));
    }

    #[test]
    fn suffix_is_only_for_executables() {
        assert_eq!(path_suffix(r"C:\Games\Aion\aion.bin"), None);
    }

    #[test]
    fn a_suffix_from_a_running_path_matches_the_same_entry_on_the_list() {
        // What a user submits is exactly what an admin approves, so once
        // approved it must match the program it came from.
        let path = r"E:\Library\My Indie Game\Binaries\Win64\MyIndie-Win64-Shipping.exe";
        let l = list(&[(path_suffix(path).unwrap().as_str(), 7)]);
        assert_eq!(find(&l, path), Some(7));
    }

    #[test]
    fn platform_comes_from_the_install_folder() {
        assert_eq!(platform_for_path(Some(r"D:\SteamLibrary\steamapps\common\X\x.exe")), "Steam");
        assert_eq!(platform_for_path(Some(r"C:\Program Files\Epic Games\X\x.exe")), "Epic Games");
        assert_eq!(platform_for_path(None), "PC (Windows)");
    }

    #[test]
    fn the_cache_file_round_trips() {
        let dir = std::env::temp_dir().join(format!("gameslist-master-list-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        save_cache(&dir, &ListFile { version: "3-0-0".into(), entries: vec![("tunic/tunic.exe".into(), 1)] });
        let read = load_cache(&dir).unwrap();
        assert_eq!(read.version, "3-0-0");
        assert_eq!(MasterList::from_file(read).len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
