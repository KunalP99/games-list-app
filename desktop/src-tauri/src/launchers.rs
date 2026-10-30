//! Working out which game an executable belongs to, for launchers other than
//! Steam.
//!
//! Steam's own `appmanifest_*.acf` gives an exact app id to key IGDB's
//! `external_games` on. Other launchers keep no such cross-reference in IGDB,
//! but several write their own install manifests locally, and those are
//! enough on their own: Epic's carry the game's real display name, which the
//! server can search IGDB for and trust on an exact match.
//!
//! Verified against a real install, in both directions. Epic's manifest for
//! Abzu gives `DisplayName: "ABZU"`, `InstallLocation` pointing at its folder,
//! and `LaunchExecutable: "AbzuGame.exe"`. But the process that actually ends
//! up with a window is a *different* executable one level deeper —
//! `AbzuGame\Binaries\Win64\AbzuGame-Win64-Shipping.exe`, standard Unreal
//! Engine layout, where `LaunchExecutable` names a thin launcher stub rather
//! than the real game binary. So matching cannot require the running exe's
//! name to equal `LaunchExecutable` — only that it is *somewhere inside* the
//! install folder, the same scoping the Steam path already uses.

use std::path::PathBuf;

/// One installed game, as Epic's own manifest describes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EpicGame {
    pub display_name: String,
    pub install_location: String,
}

/// Parse one `.item` manifest's JSON text.
///
/// Entries with a blank `LaunchExecutable` are skipped: several real entries
/// on a normal Epic install are tools sharing a folder with the actual engine
/// (Quixel Bridge and a Fab plugin both point at the same `UE_5.8` folder
/// Unreal Engine itself installs to) and have no executable of their own —
/// requiring one here is what keeps them out of the list, since nothing else
/// distinguishes them from a real, standalone game or app.
pub fn parse_manifest(text: &str) -> Option<EpicGame> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let display_name = v.get("DisplayName")?.as_str()?.trim();
    let install_location = v.get("InstallLocation")?.as_str()?.trim();
    let launch_executable = v.get("LaunchExecutable")?.as_str()?.trim();
    if display_name.is_empty() || install_location.is_empty() || launch_executable.is_empty() {
        return None;
    }
    Some(EpicGame { display_name: display_name.to_string(), install_location: install_location.to_string() })
}

/// The display name for a running executable, from a set of parsed manifests.
///
/// Scoped to the install folder alone, deliberately no stricter: see the
/// module doc for why requiring an exact executable match would miss Abzu
/// itself. Safe regardless, because a wrong guess here costs nothing — the
/// server only ever trusts it on an *exact* IGDB title match, so a folder
/// shared by something that isn't really the game in question just comes back
/// "unknown" and falls through to the ordinary prompt, the same as if this had
/// found nothing at all.
pub fn display_name_for_exe(exe_path: &str, games: &[EpicGame]) -> Option<String> {
    let exe_path = exe_path.to_lowercase();
    games
        .iter()
        .find(|g| exe_path.starts_with(&g.install_location.to_lowercase()))
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

    fn game(name: &str, loc: &str) -> EpicGame {
        EpicGame { display_name: name.into(), install_location: loc.into() }
    }

    #[test]
    fn parses_a_real_manifest() {
        // Trimmed from this machine's actual Manifests\*.item for Abzu.
        let text = r#"{
            "DisplayName": "ABZU",
            "InstallLocation": "C:\\Program Files\\Epic Games\\ABZU",
            "LaunchExecutable": "AbzuGame.exe"
        }"#;
        assert_eq!(parse_manifest(text), Some(game("ABZU", r"C:\Program Files\Epic Games\ABZU")));
    }

    #[test]
    fn skips_an_entry_with_no_launch_executable() {
        // A real entry on this machine: Quixel Bridge, which shares Unreal
        // Engine's install folder and has no exe of its own. This is the
        // thing that makes folder-only matching safe — it never becomes a
        // candidate in the first place.
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
    fn identifies_a_running_game_by_the_manifests_own_exe() {
        let games = vec![game("ABZU", r"C:\Program Files\Epic Games\ABZU")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\ABZU\AbzuGame.exe", &games),
            Some("ABZU".to_string()),
        );
    }

    #[test]
    fn identifies_the_real_game_binary_even_though_it_differs_from_the_manifest() {
        // The actual bug this guards against: AbzuGame.exe (the manifest's
        // LaunchExecutable) is a launcher stub. The process that really ends
        // up with a window is AbzuGame-Win64-Shipping.exe, one folder deeper
        // — confirmed against this machine's real install. A match requiring
        // exact executable equality missed this entirely, and fell through to
        // the "is this a game?" toast on every single launch.
        let games = vec![game("ABZU", r"C:\Program Files\Epic Games\ABZU")];
        assert_eq!(
            display_name_for_exe(
                r"C:\Program Files\Epic Games\ABZU\AbzuGame\Binaries\Win64\AbzuGame-Win64-Shipping.exe",
                &games,
            ),
            Some("ABZU".to_string()),
        );
    }

    #[test]
    fn is_case_insensitive_about_the_path() {
        let games = vec![game("ABZU", r"c:\program files\epic games\abzu")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\ABZU\AbzuGame-Win64-Shipping.exe", &games),
            Some("ABZU".to_string()),
        );
    }

    #[test]
    fn a_tool_sharing_an_engine_folder_resolves_to_whatever_real_app_owns_it() {
        // Quixel Bridge and a Fab plugin never make it into `games` at all
        // (see skips_an_entry_with_no_launch_executable), so Unreal Engine —
        // the one real entry left for this shared folder — is what anything
        // under it resolves to. A wrong guess here is still harmless: the
        // server only trusts an exact IGDB title match, and IGDB has no game
        // called "Unreal Engine", so this comes back "unknown" and changes
        // nothing.
        let games = vec![game("Unreal Engine", r"C:\Program Files\Epic Games\UE_5.8")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe", &games),
            Some("Unreal Engine".to_string()),
        );
    }

    #[test]
    fn ignores_an_executable_outside_any_known_install_folder() {
        let games = vec![game("ABZU", r"C:\Program Files\Epic Games\ABZU")];
        assert_eq!(display_name_for_exe(r"D:\Games\OtherGame\OtherGame.exe", &games), None);
    }

    #[test]
    fn picks_the_right_game_among_several_installed() {
        let games = vec![
            game("ABZU", r"C:\Program Files\Epic Games\ABZU"),
            game("Fortnite", r"C:\Program Files\Epic Games\Fortnite"),
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
