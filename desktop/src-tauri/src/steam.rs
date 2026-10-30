//! Working out which Steam game an executable belongs to.
//!
//! The registry's `RunningAppID` only knows about games launched *through*
//! Steam, and says nothing at all when someone runs the exe directly. The
//! install path does, and it is already in hand for every process we look at:
//!
//! ```text
//! C:\Program Files (x86)\Steam\steamapps\common\Hades II\Ship\Hades2.exe
//!                              └── library ──┘        └ install dir
//! ```
//!
//! That segment is a fixed anchor however deep the exe sits — `Ship\`,
//! `Binaries\`, `DeadByDaylight\Binaries\Win64\`, or Bannerlord's four levels
//! of `Modules\AIInfluence\bin\Win64_Shipping_Client\`. The parent directory
//! is not: it is wrong about half the time.
//!
//! The install dir is then matched against the `appmanifest_*.acf` files in
//! that same library, which carry both the app id and Steam's own name for the
//! game. So no part of this guesses: `libraryfolders.vdf` is not needed either,
//! because the path says which library it is in.

use std::path::{Path, PathBuf};

/// Read a top-level `"key"  "value"` pair out of a Valve Data Format file.
///
/// Deliberately simple: the keys wanted here (`appid`, `name`, `installdir`,
/// `path`) sit at the top of their block, so the first match is the right one.
/// Values are escaped C-style, and `\\` for a path separator is the only escape
/// that occurs in practice.
pub fn vdf_value(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    for line in text.lines() {
        let line = line.trim();
        let Some(rest) = line.strip_prefix(&needle) else { continue };
        // Guard against "appid_x" matching a search for "appid": a real pair
        // has whitespace between the key and its value.
        if !rest.starts_with(|c: char| c.is_whitespace()) {
            continue;
        }
        let rest = rest.trim_start();
        let value = rest.strip_prefix('"')?;
        let end = value.find('"')?;
        return Some(unescape(&value[..end]));
    }
    None
}

fn unescape(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('\\') => out.push('\\'),
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('"') => out.push('"'),
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}

/// Split an executable path into the library's `steamapps` folder and the
/// game's install directory.
///
/// Returns nothing for anything outside a Steam library, including a path that
/// stops at `steamapps\common` with no game folder after it.
pub fn steam_install_dir(exe_path: &str) -> Option<(PathBuf, String)> {
    let parts: Vec<&str> = exe_path.split(['/', '\\']).collect();

    // Searched from the right: a library can itself live under a folder called
    // "steamapps", and the last one is the real anchor.
    let idx = parts
        .iter()
        .rposition(|p| p.eq_ignore_ascii_case("steamapps"))?;
    if !parts.get(idx + 1)?.eq_ignore_ascii_case("common") {
        return None;
    }
    let install_dir = parts.get(idx + 2)?;
    if install_dir.is_empty() {
        return None;
    }

    let steamapps: PathBuf = parts[..=idx].join("\\").into();
    Some((steamapps, install_dir.to_string()))
}

/// The app id and Steam's own name for a game, from its library's manifests.
///
/// `read` takes a manifest path and returns its contents, so the matching can
/// be tested without a Steam install.
pub fn app_from_manifests<F>(
    manifests: &[PathBuf],
    install_dir: &str,
    mut read: F,
) -> Option<(u32, String)>
where
    F: FnMut(&Path) -> Option<String>,
{
    for manifest in manifests {
        let Some(text) = read(manifest) else { continue };
        let Some(dir) = vdf_value(&text, "installdir") else { continue };
        // Steam is case-insensitive about this and the on-disk folder does not
        // always match the manifest's spelling exactly.
        if !dir.eq_ignore_ascii_case(install_dir) {
            continue;
        }
        let app_id = vdf_value(&text, "appid")?.parse::<u32>().ok()?;
        let name = vdf_value(&text, "name").unwrap_or_default();
        return Some((app_id, name));
    }
    None
}

/// The Steam app id for a running executable, or nothing if it is not a Steam
/// game (or Steam's files cannot be read).
pub fn app_id_for_exe(exe_path: &str) -> Option<(u32, String)> {
    let (steamapps, install_dir) = steam_install_dir(exe_path)?;
    let manifests: Vec<PathBuf> = std::fs::read_dir(&steamapps)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("appmanifest_") && n.ends_with(".acf"))
        })
        .collect();

    app_from_manifests(&manifests, &install_dir, |p| std::fs::read_to_string(p).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_install_dir_however_deep_the_exe_sits() {
        // Every one of these is a real layout from a real library.
        let cases = [
            (r"C:\Program Files (x86)\Steam\steamapps\common\Terraria\Terraria.exe", "Terraria"),
            (r"C:\Program Files (x86)\Steam\steamapps\common\Hades II\Ship\Hades2.exe", "Hades II"),
            (r"C:\Program Files (x86)\Steam\steamapps\common\No Man's Sky\Binaries\NMS.exe", "No Man's Sky"),
            (
                r"C:\Program Files (x86)\Steam\steamapps\common\Dead by Daylight\DeadByDaylight\Binaries\Win64\DeadByDaylight-Win64-Shipping.exe",
                "Dead by Daylight",
            ),
            (
                r"C:\Program Files (x86)\Steam\steamapps\common\Mount & Blade II Bannerlord\Modules\AIInfluence\bin\Win64_Shipping_Client\rhubarb.exe",
                "Mount & Blade II Bannerlord",
            ),
        ];
        for (path, expected) in cases {
            let (_, dir) = steam_install_dir(path).unwrap_or_else(|| panic!("{path}"));
            assert_eq!(dir, expected, "{path}");
        }
    }

    #[test]
    fn works_for_a_library_on_another_drive() {
        // This machine has two libraries; only the path says which one a game
        // is in, which is why libraryfolders.vdf is not needed here.
        let (steamapps, dir) =
            steam_install_dir(r"C:\FalloutGames\steamapps\common\Fallout 4\Fallout4.exe").unwrap();
        assert_eq!(dir, "Fallout 4");
        assert_eq!(steamapps, PathBuf::from(r"C:\FalloutGames\steamapps"));
    }

    #[test]
    fn ignores_anything_outside_a_steam_library() {
        assert!(steam_install_dir(r"C:\Windows\System32\notepad.exe").is_none());
        assert!(steam_install_dir(r"D:\Games\Hollow Knight\hollow_knight.exe").is_none());
        assert!(steam_install_dir(r"C:\Steam\steamapps\downloading\12345\x.exe").is_none());
        // No game folder after common.
        assert!(steam_install_dir(r"C:\Steam\steamapps\common").is_none());
    }

    #[test]
    fn takes_the_last_steamapps_when_a_path_holds_two() {
        let (steamapps, dir) =
            steam_install_dir(r"D:\backup\steamapps\steamapps\common\Tunic\Tunic.exe").unwrap();
        assert_eq!(dir, "Tunic");
        assert_eq!(steamapps, PathBuf::from(r"D:\backup\steamapps\steamapps"));
    }

    #[test]
    fn handles_forward_slashes() {
        let (_, dir) =
            steam_install_dir("C:/Program Files (x86)/Steam/steamapps/common/Terraria/Terraria.exe")
                .unwrap();
        assert_eq!(dir, "Terraria");
    }

    #[test]
    fn reads_a_manifest() {
        // Shortened from a real appmanifest_1145350.acf.
        let manifest = "\"AppState\"\n{\n\t\"appid\"\t\t\"1145350\"\n\t\"name\"\t\t\"Hades II\"\n\t\"installdir\"\t\t\"Hades II\"\n}\n";
        assert_eq!(vdf_value(manifest, "appid").as_deref(), Some("1145350"));
        assert_eq!(vdf_value(manifest, "name").as_deref(), Some("Hades II"));
        assert_eq!(vdf_value(manifest, "installdir").as_deref(), Some("Hades II"));
        assert_eq!(vdf_value(manifest, "nope"), None);
    }

    #[test]
    fn unescapes_a_path_value() {
        let vdf = "\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n";
        assert_eq!(
            vdf_value(vdf, "path").as_deref(),
            Some(r"C:\Program Files (x86)\Steam"),
        );
    }

    #[test]
    fn does_not_match_a_key_that_merely_starts_the_same() {
        let vdf = "\t\"appid_original\"\t\t\"999\"\n\t\"appid\"\t\t\"42\"\n";
        assert_eq!(vdf_value(vdf, "appid").as_deref(), Some("42"));
    }

    #[test]
    fn picks_the_manifest_whose_install_dir_matches() {
        let files = [PathBuf::from("a.acf"), PathBuf::from("b.acf"), PathBuf::from("c.acf")];
        let read = |p: &Path| {
            Some(match p.to_str().unwrap() {
                "a.acf" => "\"appid\" \"105600\"\n\"name\" \"Terraria\"\n\"installdir\" \"Terraria\"\n",
                "b.acf" => "\"appid\" \"1794680\"\n\"name\" \"Vampire Survivors\"\n\"installdir\" \"Vampire Survivors\"\n",
                _ => "\"appid\" \"365670\"\n\"name\" \"Blender\"\n\"installdir\" \"Blender\"\n",
            }
            .to_string())
        };
        assert_eq!(
            app_from_manifests(&files, "Vampire Survivors", read),
            Some((1794680, "Vampire Survivors".to_string())),
        );
        assert_eq!(app_from_manifests(&files, "Not Installed", read), None);
    }

    #[test]
    fn matches_an_install_dir_in_a_different_case() {
        let files = [PathBuf::from("a.acf")];
        let read = |_: &Path| {
            Some("\"appid\" \"227300\"\n\"name\" \"Euro Truck Simulator 2\"\n\"installdir\" \"Euro Truck Simulator 2\"\n".to_string())
        };
        assert_eq!(
            app_from_manifests(&files, "euro truck simulator 2", read),
            Some((227300, "Euro Truck Simulator 2".to_string())),
        );
    }

    #[test]
    fn skips_a_manifest_it_cannot_read() {
        let files = [PathBuf::from("locked.acf"), PathBuf::from("good.acf")];
        let read = |p: &Path| match p.to_str().unwrap() {
            "locked.acf" => None,
            _ => Some("\"appid\" \"105600\"\n\"installdir\" \"Terraria\"\n".to_string()),
        };
        assert_eq!(
            app_from_manifests(&files, "Terraria", read),
            Some((105600, String::new())),
        );
    }
}
