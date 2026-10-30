//! Working out which game an executable belongs to, for launchers other than
//! Steam.
//!
//! Steam's own `appmanifest_*.acf` gives an exact app id to key IGDB's
//! `external_games` on. Other launchers keep no such cross-reference in IGDB,
//! but several write their own install manifests locally, and those are
//! enough on their own: Epic's carry the game's real display name, which the
//! server can search IGDB for and trust on an exact match.
//!
//! Verified against a real install: Epic's manifest for Abzu gives
//! `DisplayName: "ABZU"`, `InstallLocation` pointing at its folder, and
//! `LaunchExecutable: "AbzuGame.exe"` — all three line up with what Task
//! Manager shows while the game is actually running.

use std::path::{Path, PathBuf};

/// One installed game, as Epic's own manifest describes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EpicGame {
    pub display_name: String,
    pub install_location: String,
    /// The exe Epic itself launches, e.g. "AbzuGame.exe" — not a full path,
    /// and not necessarily what ends up with a window: some entries (editors,
    /// plugins) leave this blank, which is also what rules them out below.
    pub launch_executable: String,
}

/// Parse one `.item` manifest's JSON text.
///
/// Entries with a blank `LaunchExecutable` are skipped rather than kept with
/// an empty field: several real entries on a normal Epic install are tools
/// sharing a folder with the actual engine (Quixel Bridge and a Fab plugin
/// both point at the same `UE_5.8` folder Unreal Engine itself installs to),
/// and without a specific exe to require a match against, trusting the folder
/// alone would make any of them match whichever entry happened to be read
/// first.
pub fn parse_manifest(text: &str) -> Option<EpicGame> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let display_name = v.get("DisplayName")?.as_str()?.trim();
    let install_location = v.get("InstallLocation")?.as_str()?.trim();
    let launch_executable = v.get("LaunchExecutable")?.as_str()?.trim();
    if display_name.is_empty() || install_location.is_empty() || launch_executable.is_empty() {
        return None;
    }
    Some(EpicGame {
        display_name: display_name.to_string(),
        install_location: install_location.to_string(),
        launch_executable: launch_executable.to_string(),
    })
}

/// The display name for a running executable, from a set of parsed manifests.
///
/// Matches on both the install folder *and* the specific launch executable —
/// the folder alone is not enough, per `parse_manifest`'s doc comment.
pub fn display_name_for_exe(exe_path: &str, games: &[EpicGame]) -> Option<String> {
    let exe_path = exe_path.to_lowercase();
    let exe_name = Path::new(&exe_path).file_name()?.to_str()?;

    games
        .iter()
        .find(|g| {
            let install = g.install_location.to_lowercase();
            let launch = g.launch_executable.to_lowercase();
            // The launch executable is usually bare, but a manifest is free to
            // nest it in a subfolder, so compare basenames, not raw equality.
            let launch_base = Path::new(&launch).file_name().and_then(|f| f.to_str()).unwrap_or(&launch);
            exe_path.starts_with(&install) && exe_name == launch_base
        })
        .map(|g| g.display_name.clone())
}

/// Every installed game Epic's launcher currently knows about.
///
/// Reads `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`. Missing
/// entirely when Epic has never been installed — that is not an error, just
/// nothing to offer here.
pub fn epic_games() -> Vec<EpicGame> {
    let Some(program_data) = std::env::var_os("ProgramData") else {
        return Vec::new();
    };
    let dir: PathBuf = [program_data.as_os_str(), "Epic".as_ref(), "EpicGamesLauncher".as_ref(), "Data".as_ref(), "Manifests".as_ref()]
        .iter()
        .collect();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("item"))
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .filter_map(|text| parse_manifest(&text))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(name: &str, loc: &str, exe: &str) -> EpicGame {
        EpicGame { display_name: name.into(), install_location: loc.into(), launch_executable: exe.into() }
    }

    #[test]
    fn parses_a_real_manifest() {
        // Trimmed from this machine's actual Manifests\*.item for Abzu.
        let text = r#"{
            "DisplayName": "ABZU",
            "InstallLocation": "C:\\Program Files\\Epic Games\\ABZU",
            "LaunchExecutable": "AbzuGame.exe"
        }"#;
        assert_eq!(
            parse_manifest(text),
            Some(game("ABZU", r"C:\Program Files\Epic Games\ABZU", "AbzuGame.exe")),
        );
    }

    #[test]
    fn skips_an_entry_with_no_launch_executable() {
        // A real entry on this machine: Quixel Bridge, which shares Unreal
        // Engine's install folder and has no exe of its own.
        let text = r#"{
            "DisplayName": "Quixel Bridge",
            "InstallLocation": "C:\\Program Files\\Epic Games\\UE_5.8",
            "LaunchExecutable": ""
        }"#;
        assert_eq!(parse_manifest(text), None);
    }

    #[test]
    fn skips_malformed_or_incomplete_json() {
        assert_eq!(parse_manifest("not json"), None);
        assert_eq!(parse_manifest(r#"{"DisplayName": "X"}"#), None);
    }

    #[test]
    fn identifies_a_running_game_by_its_real_exe() {
        let games = vec![game("ABZU", r"C:\Program Files\Epic Games\ABZU", "AbzuGame.exe")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\ABZU\AbzuGame.exe", &games),
            Some("ABZU".to_string()),
        );
    }

    #[test]
    fn is_case_insensitive_about_the_path_and_the_executable() {
        let games = vec![game("ABZU", r"c:\program files\epic games\abzu", "AbzuGame.exe")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\ABZU\ABZUGAME.EXE", &games),
            Some("ABZU".to_string()),
        );
    }

    #[test]
    fn does_not_match_a_different_program_sharing_the_install_folder() {
        // The real ambiguity this guards against: three manifests on this
        // machine share C:\Program Files\Epic Games\UE_5.8. Running the
        // editor must not read back as "Quixel Bridge" or "Fab UE Plugin".
        let games = vec![
            game("Unreal Engine", r"C:\Program Files\Epic Games\UE_5.8", "Engine/Binaries/Win64/UnrealEditor.exe"),
        ];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\SomeOtherTool.exe", &games),
            None,
        );
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe", &games),
            Some("Unreal Engine".to_string()),
        );
    }

    #[test]
    fn ignores_an_executable_outside_any_known_install_folder() {
        let games = vec![game("ABZU", r"C:\Program Files\Epic Games\ABZU", "AbzuGame.exe")];
        assert_eq!(display_name_for_exe(r"D:\Games\OtherGame\OtherGame.exe", &games), None);
    }

    #[test]
    fn picks_the_right_game_among_several_installed() {
        let games = vec![
            game("ABZU", r"C:\Program Files\Epic Games\ABZU", "AbzuGame.exe"),
            game("Fortnite", r"C:\Program Files\Epic Games\Fortnite", "FortniteClient-Win64-Shipping.exe"),
        ];
        assert_eq!(
            display_name_for_exe(
                r"C:\Program Files\Epic Games\Fortnite\FortniteGame\Binaries\Win64\FortniteClient-Win64-Shipping.exe",
                &games,
            ),
            Some("Fortnite".to_string()),
        );
    }
}
