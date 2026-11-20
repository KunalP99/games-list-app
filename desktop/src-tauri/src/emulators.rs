//! Games played in emulators.
//!
//! One emulator program runs every game, so it can never be linked to a game
//! by its executable the way everything else is. Instead this reads what the
//! emulator is *showing*: its window title, which names the running game and,
//! for most of them, the disc's serial code (SLUS-20946, BLUS30443, …). The
//! site works out the game from that (`/api/agent/identify`'s `emulator`
//! mode) and remembers what the person picked.
//!
//! Emulator processes are taken out of the ordinary candidate list before any
//! matching (`tracker::run_loop`), so they are never linked, never put to the
//! other identify paths and never raise the "is this a game?" toast.
//!
//! Nothing here reads a game file: only window titles.

/// An emulator the tracker recognises.
#[derive(Debug, PartialEq, Eq)]
pub struct Emulator {
    /// As shown in the pop-up: "Playing … in PCSX2?"
    pub name: &'static str,
    /// IGDB platform id (lib/emulators.ts on the site has the same table).
    pub platform: u32,
    /// Lowercased executable-name prefixes: builds name their exe after the
    /// CPU and build type (duckstation-qt-x64-ReleaseLTCG.exe, pcsx2-qtx64-avx2.exe).
    prefixes: &'static [&'static str],
    /// Whether a game window always shows a serial. For these, a title with
    /// no serial is the emulator's own window or a dialog ("Settings"), never
    /// a game, which keeps dialogs from being searched for as games.
    needs_serial: bool,
}

pub const EMULATORS: &[Emulator] = &[
    Emulator { name: "DuckStation", platform: 7, prefixes: &["duckstation"], needs_serial: false },
    Emulator { name: "PCSX2", platform: 8, prefixes: &["pcsx2"], needs_serial: false },
    Emulator { name: "RPCS3", platform: 9, prefixes: &["rpcs3"], needs_serial: true },
    Emulator { name: "PPSSPP", platform: 38, prefixes: &["ppsspp"], needs_serial: true },
    Emulator { name: "Vita3K", platform: 46, prefixes: &["vita3k"], needs_serial: true },
    Emulator { name: "shadPS4", platform: 48, prefixes: &["shadps4"], needs_serial: false },
];

/// The emulator a running program is, if it is one. `exe_name` is lowercased.
pub fn emulator_for(exe_name: &str) -> Option<&'static Emulator> {
    EMULATORS.iter().find(|e| e.prefixes.iter().any(|p| exe_name.starts_with(p)) && exe_name.ends_with(".exe"))
}

/// A game an emulator is showing.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct EmulatedGame {
    pub platform: u32,
    /// Four letters and five digits, no separator: "SLUS20946".
    pub serial: Option<String>,
    /// The name as the emulator shows it; the site cleans it further.
    pub title: Option<String>,
}

impl EmulatedGame {
    /// What this game is remembered under for the rest of the run: the
    /// serial where there is one, else the name in bare letters and digits.
    /// (The site keys its own memory the same way.)
    pub fn key(&self) -> String {
        match (&self.serial, &self.title) {
            (Some(serial), _) => format!("{}:serial:{serial}", self.platform),
            (None, Some(title)) => format!("{}:title:{}", self.platform, bare(title)),
            (None, None) => format!("{}:none", self.platform),
        }
    }

    /// What to call it in a pop-up.
    pub fn label(&self) -> String {
        self.title.clone().or_else(|| self.serial.clone()).unwrap_or_default()
    }
}

fn bare(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase()
}

/// The game in any of an emulator process's window titles, if one is running.
pub fn game_in(emulator: &Emulator, titles: &[String]) -> Option<EmulatedGame> {
    titles.iter().find_map(|t| parse_title(emulator, t))
}

/// The game one window title names, or None for the emulator's own window, a
/// dialog, or its game list.
pub fn parse_title(emulator: &Emulator, window_title: &str) -> Option<EmulatedGame> {
    let found = find_serial(window_title);
    if emulator.needs_serial && found.is_none() {
        return None;
    }

    // Take the serial out, with any brackets around it, then keep whatever
    // parts of the title aren't the emulator talking about itself.
    let mut rest = window_title.to_string();
    if let Some((start, end, _)) = &found {
        let (mut s, mut e) = (*start, *end);
        let bytes = rest.as_bytes();
        if s > 0 && e < bytes.len() && matches!((bytes[s - 1], bytes[e]), (b'[', b']') | (b'(', b')')) {
            s -= 1;
            e += 1;
        }
        rest.replace_range(s..e, " ");
    }
    let parts: Vec<String> = rest
        .split(" | ")
        .flat_map(|p| p.split(" - "))
        .map(|p| p.trim().trim_start_matches(':').trim_end_matches(':').trim().to_string())
        .filter(|p| !is_noise(p))
        .collect();
    let title = (!parts.is_empty()).then(|| parts.join(" - "));

    if title.is_none() && found.is_none() {
        return None;
    }
    Some(EmulatedGame { platform: emulator.platform, serial: found.map(|f| f.2), title })
}

/// Window titles that aren't a game: an emulator's own windows and dialogs.
const NOT_A_GAME: &[&str] = &[
    "settings", "controller settings", "input settings", "game properties", "properties",
    "memory card editor", "memory cards", "game list", "cheats", "cheat manager", "debugger",
    "log", "log window", "console", "about", "achievements", "bios", "setup wizard",
    "first time setup", "save states", "patches", "cover downloader", "update", "updater",
    "master", "alpha", "booting", "loading", "paused", "trophy manager", "user manager",
    "vfs", "pad settings", "savedata manager", "package installer", "compatibility",
    // Seen live, at start-up: DuckStation and PCSX2's updater, shadPS4's settings move.
    "automatic updater", "config migration", "welcome to rpcs3",
];

const EMULATOR_WORDS: &[&str] = &["duckstation", "pcsx2", "rpcs3", "ppsspp", "vita3k", "shadps4"];
const RENDERERS: &[&str] = &[
    "vulkan", "opengl", "opengl es", "d3d11", "d3d12", "direct3d", "direct3d 11", "direct3d 12",
    "metal", "software", "null", "sw",
];

/// Whether part of a window title is the emulator talking about itself:
/// its name and version, an FPS or speed readout, the renderer, a
/// resolution, or a dialog's name.
fn is_noise(part: &str) -> bool {
    let lower = part.to_lowercase();
    if !lower.chars().any(|c| c.is_alphabetic()) {
        return true;
    }
    if EMULATOR_WORDS.iter().any(|w| lower.starts_with(w)) {
        return true;
    }
    if NOT_A_GAME.contains(&lower.as_str()) || RENDERERS.contains(&lower.as_str()) {
        return true;
    }
    if lower.contains("fps") || lower.starts_with("speed") || lower.starts_with("vps") || lower.contains('%') {
        return true;
    }
    // A version ("v1.17.1", "0.0.32-16000-abc1234 Alpha") or a resolution ("1920x1080").
    let first = lower.split_whitespace().next().unwrap_or("");
    let versionish = |w: &str| {
        let w = w.strip_prefix('v').unwrap_or(w);
        w.chars().next().is_some_and(|c| c.is_ascii_digit()) && w.contains('.')
    };
    if versionish(first) {
        return true;
    }
    let resolution = |w: &str| {
        let mut halves = w.split('x');
        matches!((halves.next(), halves.next(), halves.next()), (Some(a), Some(b), None)
            if !a.is_empty() && !b.is_empty() && a.chars().all(|c| c.is_ascii_digit()) && b.chars().all(|c| c.is_ascii_digit()))
    };
    resolution(first) && lower.split_whitespace().count() == 1
}

/// A PlayStation serial in `s`: four capital letters, an optional `-` or `_`,
/// then five digits (or three, a dot and two, as disc files write them:
/// SLUS_209.46). Returns its byte range and the canonical "SLUS20946".
pub fn find_serial(s: &str) -> Option<(usize, usize, String)> {
    let b = s.as_bytes();
    let boundary = |i: usize| i >= b.len() || !b[i].is_ascii_alphanumeric();
    let mut i = 0;
    while i + 9 <= b.len() {
        if (i == 0 || !b[i - 1].is_ascii_alphanumeric()) && b[i..i + 4].iter().all(|c| c.is_ascii_uppercase()) {
            let mut j = i + 4;
            if j < b.len() && (b[j] == b'-' || b[j] == b'_') {
                j += 1;
            }
            let digits = |from: usize, n: usize| from + n <= b.len() && b[from..from + n].iter().all(|c| c.is_ascii_digit());
            let letters = std::str::from_utf8(&b[i..i + 4]).unwrap_or("");
            if digits(j, 5) && boundary(j + 5) {
                let num = std::str::from_utf8(&b[j..j + 5]).unwrap_or("");
                return Some((i, j + 5, format!("{letters}{num}")));
            }
            if digits(j, 3) && j + 3 < b.len() && b[j + 3] == b'.' && digits(j + 4, 2) && boundary(j + 6) {
                let a = std::str::from_utf8(&b[j..j + 3]).unwrap_or("");
                let c = std::str::from_utf8(&b[j + 4..j + 6]).unwrap_or("");
                return Some((i, j + 6, format!("{letters}{a}{c}")));
            }
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn emu(name: &str) -> &'static Emulator {
        EMULATORS.iter().find(|e| e.name == name).unwrap()
    }
    fn game(name: &str, title: &str) -> Option<(Option<String>, Option<String>)> {
        parse_title(emu(name), title).map(|g| (g.serial, g.title))
    }
    fn some(serial: Option<&str>, title: Option<&str>) -> Option<(Option<String>, Option<String>)> {
        Some((serial.map(String::from), title.map(String::from)))
    }

    #[test]
    fn recognises_each_emulator_by_its_executable() {
        assert_eq!(emulator_for("duckstation-qt-x64-releaseltcg.exe").unwrap().name, "DuckStation");
        assert_eq!(emulator_for("pcsx2-qtx64-avx2.exe").unwrap().name, "PCSX2");
        assert_eq!(emulator_for("pcsx2-qt.exe").unwrap().platform, 8);
        assert_eq!(emulator_for("rpcs3.exe").unwrap().platform, 9);
        assert_eq!(emulator_for("ppssppwindows64.exe").unwrap().platform, 38);
        assert_eq!(emulator_for("vita3k.exe").unwrap().platform, 46);
        assert_eq!(emulator_for("shadps4.exe").unwrap().platform, 48);
        assert!(emulator_for("steam.exe").is_none());
        assert!(emulator_for("pcsx2-updater.dll").is_none());
    }

    #[test]
    fn rpcs3_reads_the_game_and_serial_past_the_readouts() {
        assert_eq!(
            game("RPCS3", "FPS: 30.00 | Vulkan | 0.0.32-16823-a1b2c3d4 Alpha | Demon's Souls [BLUS30443]"),
            some(Some("BLUS30443"), Some("Demon's Souls")),
        );
    }

    #[test]
    fn rpcs3_main_window_and_dialogs_are_not_games() {
        assert_eq!(game("RPCS3", "RPCS3 0.0.32-16823-a1b2c3d4 Alpha | master"), None);
        assert_eq!(game("RPCS3", "Settings"), None);
    }

    #[test]
    fn ppsspp_reads_serial_then_title() {
        assert_eq!(
            game("PPSSPP", "PPSSPP v1.17.1 - ULUS10336 : Crisis Core: Final Fantasy VII"),
            some(Some("ULUS10336"), Some("Crisis Core: Final Fantasy VII")),
        );
        assert_eq!(game("PPSSPP", "PPSSPP v1.17.1"), None);
    }

    #[test]
    fn vita3k_reads_title_and_bracketed_serial() {
        assert_eq!(
            game("Vita3K", "Vita3K v0.2.0 | Persona 4 Golden (PCSE00120) | Vulkan | FPS: 60 avg: 59 max: 60"),
            some(Some("PCSE00120"), Some("Persona 4 Golden")),
        );
    }

    #[test]
    fn duckstation_and_pcsx2_read_a_plain_name() {
        assert_eq!(game("DuckStation", "Final Fantasy VII (USA) (Disc 1)"), some(None, Some("Final Fantasy VII (USA) (Disc 1)")));
        assert_eq!(game("DuckStation", "Spyro the Dragon - DuckStation v0.1-7294"), some(None, Some("Spyro the Dragon")));
        assert_eq!(game("PCSX2", "Shadow of the Colossus [SCUS-97472]"), some(Some("SCUS97472"), Some("Shadow of the Colossus")));
        assert_eq!(game("PCSX2", "Ratchet & Clank"), some(None, Some("Ratchet & Clank")));
    }

    #[test]
    fn an_emulator_on_its_own_or_in_a_dialog_is_not_a_game() {
        assert_eq!(game("DuckStation", "DuckStation v0.1-7294"), None);
        assert_eq!(game("PCSX2", "PCSX2 v2.2.0"), None);
        assert_eq!(game("PCSX2", "Settings"), None);
        assert_eq!(game("PCSX2", "Controller Settings"), None);
        assert_eq!(game("shadPS4", "shadPS4 v0.5.0"), None);
    }

    #[test]
    fn real_idle_titles_seen_live_are_not_games() {
        // Captured from the real emulators with no game running (2026-11-20).
        assert_eq!(game("DuckStation", "DuckStation 0.1-11826"), None);
        assert_eq!(game("DuckStation", "Automatic Updater"), None);
        assert_eq!(game("PCSX2", "PCSX2 v2.3.185"), None);
        assert_eq!(game("PCSX2", "Automatic Updater"), None);
        assert_eq!(game("RPCS3", "Welcome to RPCS3"), None);
        assert_eq!(game("PPSSPP", "PPSSPP v1.20.3"), None);
        assert_eq!(game("shadPS4", "Config Migration"), None);
    }

    #[test]
    fn a_dash_inside_a_game_name_survives() {
        assert_eq!(
            game("PCSX2", "Metal Gear Solid 3 - Snake Eater - PCSX2 v2.2.0"),
            some(None, Some("Metal Gear Solid 3 - Snake Eater")),
        );
    }

    #[test]
    fn shadps4_reads_the_game_beside_its_version() {
        assert_eq!(game("shadPS4", "shadPS4 v0.5.0 | Bloodborne"), some(None, Some("Bloodborne")));
        assert_eq!(game("shadPS4", "shadPS4 v0.5.0 | CUSA00900 | Bloodborne"), some(Some("CUSA00900"), Some("Bloodborne")));
    }

    #[test]
    fn serials_in_every_written_form() {
        assert_eq!(find_serial("SLUS-20946").unwrap().2, "SLUS20946");
        assert_eq!(find_serial("x SLUS_209.46 y").unwrap().2, "SLUS20946");
        assert_eq!(find_serial("[BLUS30443]").unwrap().2, "BLUS30443");
        assert!(find_serial("ABCDE12345").is_none(), "five letters is not a serial");
        assert!(find_serial("SLUS2094").is_none());
        assert!(find_serial("slus20946").is_none(), "serials are written in capitals");
    }

    #[test]
    fn the_first_window_with_a_game_wins() {
        let titles = vec!["PCSX2 v2.2.0".to_string(), "Okami [SLUS-21115]".to_string()];
        let g = game_in(emu("PCSX2"), &titles).unwrap();
        assert_eq!(g.serial.as_deref(), Some("SLUS21115"));
        assert_eq!(g.key(), "8:serial:SLUS21115");
    }

    #[test]
    fn a_game_without_a_serial_is_remembered_by_its_name() {
        let g = parse_title(emu("PCSX2"), "Ratchet & Clank").unwrap();
        assert_eq!(g.key(), "8:title:ratchetclank");
        assert_eq!(g.label(), "Ratchet & Clank");
    }
}
