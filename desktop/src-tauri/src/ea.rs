//! Working out which game an executable belongs to, for EA App.
//!
//! Same idea as `launchers.rs` for Epic, a different source. EA writes one
//! registry key per title it knows about — owned, not necessarily installed
//! — under `HKLM\Software\Wow6432Node\Origin Games\<contentID>`. Verified
//! against a real machine: two real entries there, `Bejeweled® 3` and
//! `STAR WARS™ Battlefront™ II`, both owned but neither actually installed —
//! which is exactly why a title alone is not enough to treat as a candidate;
//! an `Install Dir` value only appears once a title is actually installed,
//! and that is the one this reads.

/// One game EA's registry knows about, with somewhere on disk it actually is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EaGame {
    pub display_name: String,
    pub install_location: String,
}

/// Parse one `Origin Games\<contentID>` subkey's values.
///
/// `None` for an owned-but-not-installed title (no `Install Dir`) — this is
/// not a rare edge case to guard against, it is the normal state for most of
/// what is in this key. Also `None` for a blank display name, which should
/// not occur but is cheap to rule out rather than assume.
pub fn parse_entry(display_name: Option<&str>, install_dir: Option<&str>) -> Option<EaGame> {
    let display_name = display_name?.trim();
    let install_dir = install_dir?.trim();
    if display_name.is_empty() || install_dir.is_empty() {
        return None;
    }
    Some(EaGame { display_name: display_name.to_string(), install_location: install_dir.to_string() })
}

/// The display name for a running executable, from a set of installed games.
///
/// Install-folder-prefix only, not an exe-name match — same reasoning as the
/// Epic path, and more clearly necessary here: EA's library spans in-house
/// and third-party engines with no one naming convention the way Unreal's
/// `-Win64-Shipping.exe` is, so requiring a specific exe name would miss far
/// more than it would ever protect against. Safe regardless, because the
/// server only ever trusts an *exact* IGDB title match — a wrong guess here
/// just comes back "unknown" and falls through to the ordinary prompt.
pub fn display_name_for_exe(exe_path: &str, games: &[EaGame]) -> Option<String> {
    let exe_path = exe_path.to_lowercase();
    games
        .iter()
        .find(|g| exe_path.starts_with(&g.install_location.to_lowercase()))
        .map(|g| g.display_name.clone())
}

/// Every EA title installed on this machine, per the registry.
///
/// Reads `HKLM\Software\Wow6432Node\Origin Games`. Missing entirely when EA
/// App has never been installed — not an error, just nothing to offer here.
#[cfg(windows)]
pub fn ea_games() -> Vec<EaGame> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(root) = hklm.open_subkey("Software\\Wow6432Node\\Origin Games") else {
        return Vec::new();
    };

    root.enum_keys()
        .filter_map(|name| name.ok())
        .filter_map(|name| {
            let key = root.open_subkey(&name).ok()?;
            let display_name: Option<String> = key.get_value("DisplayName").ok();
            let install_dir: Option<String> = key.get_value("Install Dir").ok();
            parse_entry(display_name.as_deref(), install_dir.as_deref())
        })
        .collect()
}

#[cfg(not(windows))]
pub fn ea_games() -> Vec<EaGame> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(name: &str, loc: &str) -> EaGame {
        EaGame { display_name: name.into(), install_location: loc.into() }
    }

    #[test]
    fn parses_an_entry_with_both_values() {
        assert_eq!(
            parse_entry(Some("Star Wars Battlefront II"), Some(r"C:\Program Files\EA Games\Battlefront II")),
            Some(game("Star Wars Battlefront II", r"C:\Program Files\EA Games\Battlefront II")),
        );
    }

    #[test]
    fn skips_an_owned_but_not_installed_title() {
        // The real case this guards against: Bejeweled 3 and Star Wars
        // Battlefront II are both licensed on this machine with no
        // corresponding install — DisplayName exists, Install Dir does not.
        assert_eq!(parse_entry(Some("Bejeweled\u{ae} 3"), None), None);
    }

    #[test]
    fn skips_a_blank_display_name_or_install_dir() {
        assert_eq!(parse_entry(Some(""), Some(r"C:\Games\X")), None);
        assert_eq!(parse_entry(Some("X"), Some("  ")), None);
    }

    #[test]
    fn identifies_a_running_game_by_its_install_folder() {
        let games = vec![game("Dragon Age: The Veilguard", r"C:\Program Files\EA Games\Dragon Age The Veilguard")];
        assert_eq!(
            display_name_for_exe(
                r"C:\Program Files\EA Games\Dragon Age The Veilguard\bin\DragonAge.exe",
                &games,
            ),
            Some("Dragon Age: The Veilguard".to_string()),
        );
    }

    #[test]
    fn is_case_insensitive_about_the_path() {
        let games = vec![game("Titanfall 2", r"c:\program files\ea games\titanfall2")];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\EA Games\Titanfall2\Titanfall2.exe", &games),
            Some("Titanfall 2".to_string()),
        );
    }

    #[test]
    fn ignores_an_executable_outside_any_known_install_folder() {
        let games = vec![game("Titanfall 2", r"C:\Program Files\EA Games\Titanfall2")];
        assert_eq!(display_name_for_exe(r"D:\Games\OtherGame\OtherGame.exe", &games), None);
    }

    #[test]
    fn picks_the_right_game_among_several_installed() {
        let games = vec![
            game("Titanfall 2", r"C:\Program Files\EA Games\Titanfall2"),
            game("Star Wars Jedi: Survivor", r"C:\Program Files\EA Games\Jedi Survivor"),
        ];
        assert_eq!(
            display_name_for_exe(r"C:\Program Files\EA Games\Jedi Survivor\JEDISURVIVOR.exe", &games),
            Some("Star Wars Jedi: Survivor".to_string()),
        );
    }
}
