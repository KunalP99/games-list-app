//! Working out which game an executable belongs to, for Battle.net.
//!
//! `product.db`, Battle.net Agent's main install record, is an undocumented
//! protobuf with no public schema — the reason this was deferred when EA and
//! Epic were built. But the Agent also writes a second, much simpler file for
//! its own library view: `aggregate.json`. Verified live on this machine,
//! currently playing: `{"name": "Overwatch", "icon_path":
//! "C:/Program Files (x86)/Overwatch/Overwatch Launcher.exe", ...}` — a clean
//! display title (no trademark symbols to strip, unlike EA's) and an install
//! folder, in exactly the shape `launchers.rs` already matches Epic games on.
//! The real running process confirms the folder match:
//! `Overwatch.exe` lives at
//! `C:\Program Files (x86)\Overwatch\_retail_\Overwatch.exe`, sharing the
//! `...\Overwatch\` prefix with `icon_path`'s own directory.

use std::path::{Path, PathBuf};

/// One installed game, as Battle.net's own library file describes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BattleNetGame {
    pub name: String,
    pub install_folder: String,
}

/// Parse `aggregate.json`'s text.
///
/// `icon_path` names a launcher executable, not the install folder directly —
/// its parent directory is what's actually wanted, the same scoping Epic's
/// `InstallLocation` gives for free. An entry missing either field, or whose
/// `icon_path` has no parent, is skipped rather than failing the whole file.
pub fn parse_aggregate(text: &str) -> Vec<BattleNetGame> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let Some(installed) = v.get("installed").and_then(|i| i.as_array()) else {
        return Vec::new();
    };

    installed
        .iter()
        .filter_map(|entry| {
            let name = entry.get("name")?.as_str()?.trim();
            let icon_path = entry.get("icon_path")?.as_str()?.trim();
            if name.is_empty() || icon_path.is_empty() {
                return None;
            }
            let install_folder = Path::new(icon_path).parent()?.to_str()?.to_string();
            Some(BattleNetGame { name: name.to_string(), install_folder })
        })
        .collect()
}

/// The display name for a running executable, from a parsed `aggregate.json`.
///
/// Folder-only matching, same reasoning as Epic's: a wrong guess costs
/// nothing, since the server only trusts an exact IGDB title match.
///
/// `aggregate.json` writes `icon_path` with forward slashes
/// (`"C:/Program Files (x86)/Overwatch/..."`) while a running process's own
/// path is backslashed — both sides are normalised before comparing, or
/// every real match would silently miss.
pub fn display_name_for_exe(exe_path: &str, games: &[BattleNetGame]) -> Option<String> {
    let exe_path = exe_path.to_lowercase().replace('/', "\\");
    games
        .iter()
        .find(|g| exe_path.starts_with(&g.install_folder.to_lowercase().replace('/', "\\")))
        .map(|g| g.name.clone())
}

/// Every installed game Battle.net's Agent currently knows about.
///
/// Reads `%ProgramData%\Battle.net\Agent\aggregate.json`. Missing entirely
/// when Battle.net has never been installed — that is not an error, just
/// nothing to offer here.
pub fn battlenet_games() -> Vec<BattleNetGame> {
    let Some(program_data) = std::env::var_os("ProgramData") else {
        return Vec::new();
    };
    let path: PathBuf = [program_data.as_os_str(), "Battle.net".as_ref(), "Agent".as_ref(), "aggregate.json".as_ref()]
        .iter()
        .collect();
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    parse_aggregate(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(name: &str, folder: &str) -> BattleNetGame {
        BattleNetGame { name: name.into(), install_folder: folder.into() }
    }

    #[test]
    fn parses_a_real_aggregate_json() {
        // Captured live from this machine's actual aggregate.json.
        let text = r#"{
            "installed": [
                {
                    "icon_path": "C:/Program Files (x86)/Overwatch/Overwatch Launcher.exe",
                    "launch_uri": "battlenet://game/pro",
                    "name": "Overwatch",
                    "product_id": "pro"
                },
                {
                    "icon_path": "C:/Program Files (x86)/Hearthstone/Hearthstone Beta Launcher.exe",
                    "name": "Hearthstone",
                    "product_id": "hsb"
                }
            ]
        }"#;
        assert_eq!(
            parse_aggregate(text),
            vec![
                game("Overwatch", "C:/Program Files (x86)/Overwatch"),
                game("Hearthstone", "C:/Program Files (x86)/Hearthstone"),
            ],
        );
    }

    #[test]
    fn is_empty_for_malformed_or_incomplete_json() {
        assert_eq!(parse_aggregate("not json"), Vec::new());
        assert_eq!(parse_aggregate(r#"{"installed": [{"name": "X"}]}"#), Vec::new());
        assert_eq!(parse_aggregate(r#"{"nothing": "here"}"#), Vec::new());
    }

    #[test]
    fn identifies_the_real_game_binary_nested_under_the_install_folder() {
        // The actual running shape on this machine: the process isn't the
        // launcher icon_path names, but one that sits deeper in the same
        // install folder — the same reasoning as Epic's AbzuGame case.
        let games = vec![game("Overwatch", "C:/Program Files (x86)/Overwatch")];
        assert_eq!(
            display_name_for_exe(
                r"C:\Program Files (x86)\Overwatch\_retail_\Overwatch.exe",
                &games,
            ),
            Some("Overwatch".to_string()),
        );
    }

    #[test]
    fn is_case_insensitive_about_the_path() {
        let games = vec![game("Overwatch", "c:/program files (x86)/overwatch")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files (x86)\Overwatch\_retail_\Overwatch.exe", &games),
            Some("Overwatch".to_string()),
        );
    }

    #[test]
    fn ignores_an_executable_outside_any_known_install_folder() {
        let games = vec![game("Overwatch", "C:/Program Files (x86)/Overwatch")];
        assert_eq!(display_name_for_exe(r"D:\Games\OtherGame\OtherGame.exe", &games), None);
    }

    #[test]
    fn picks_the_right_game_among_several_installed() {
        let games = vec![
            game("Overwatch", "C:/Program Files (x86)/Overwatch"),
            game("Hearthstone", "C:/Program Files (x86)/Hearthstone"),
        ];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files (x86)\Hearthstone\Hearthstone Beta.exe", &games),
            Some("Hearthstone".to_string()),
        );
    }
}
