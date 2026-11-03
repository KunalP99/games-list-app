//! Everything the app keeps on disk: the device token, which site it talks to,
//! unsent checkpoints, and which executables we have already asked about.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub const DEFAULT_API_BASE: &str = "https://games-list-app-three.vercel.app";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// The device token. None until the user has paired this PC.
    pub token: Option<String>,
    pub api_base: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { token: None, api_base: DEFAULT_API_BASE.to_string() }
    }
}

impl AppConfig {
    pub fn is_paired(&self) -> bool {
        self.token.as_deref().is_some_and(|t| !t.is_empty())
    }

    /// Trailing slashes would produce "//api/agent/..." when joined.
    pub fn base(&self) -> String {
        self.api_base.trim_end_matches('/').to_string()
    }
}

fn path_in(dir: &Path, name: &str) -> PathBuf {
    dir.join(name)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let raw = std::fs::read_to_string(path).ok()?;
    // Strip a UTF-8 byte order mark. PowerShell's `Set-Content -Encoding utf8`
    // writes one, and so does Notepad; serde rejects it. Without this the app
    // falls back to its defaults and quietly talks to the wrong site, which
    // reads as "my config was ignored" rather than as a parse error.
    let raw = raw.trim_start_matches('\u{feff}');
    match serde_json::from_str(raw) {
        Ok(value) => Some(value),
        Err(err) => {
            log::warn!("ignoring {}: {err}", path.display());
            None
        }
    }
}

fn write_json<T: Serialize>(path: &Path, value: &T) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(value) {
        let _ = std::fs::write(path, text);
    }
}

pub fn load(dir: &Path) -> AppConfig {
    read_json(&path_in(dir, "config.json")).unwrap_or_default()
}

pub fn save(dir: &Path, config: &AppConfig) {
    write_json(&path_in(dir, "config.json"), config);
}

// ── Offline queue ───────────────────────────────────────────────────────────
// Checkpoints that could not be sent. The server applies only the delta of a
// session and dedupes on its client id, so retrying bluntly is safe — a
// replayed checkpoint adds nothing.

pub fn load_queue(dir: &Path) -> Vec<serde_json::Value> {
    read_json(&path_in(dir, "pending.json")).unwrap_or_default()
}

pub fn save_queue(dir: &Path, queue: &[serde_json::Value]) {
    write_json(&path_in(dir, "pending.json"), &queue);
}

// ── Asked-about executables ─────────────────────────────────────────────────
// Remembered across restarts, so dismissing a prompt means never seeing it
// again rather than seeing it every time the app starts.

pub fn load_asked(dir: &Path) -> HashSet<String> {
    read_json::<Vec<String>>(&path_in(dir, "asked.json"))
        .unwrap_or_default()
        .into_iter()
        .collect()
}

pub fn add_asked(dir: &Path, exe_name: &str) {
    let mut asked = load_asked(dir);
    if asked.insert(exe_name.to_string()) {
        let list: Vec<String> = asked.into_iter().collect();
        write_json(&path_in(dir, "asked.json"), &list);
    }
}

// ── Games awaiting platform confirmation ────────────────────────────────────
// A game just auto-filed still shows the platform-confirm prompt the next
// time (and every time) it's seen running, until the user actually answers
// it — unlike `asked.json`, this is not "never ask again", it's "ask again
// on each run until answered". Persisted (rather than held only in memory)
// so quitting the app mid-answer doesn't lose the question, same reasoning
// as `asked.json`.

pub fn load_unconfirmed_platforms(dir: &Path) -> HashSet<String> {
    read_json::<Vec<String>>(&path_in(dir, "unconfirmed-platforms.json"))
        .unwrap_or_default()
        .into_iter()
        .collect()
}

pub fn add_unconfirmed_platform(dir: &Path, game_id: &str) {
    let mut set = load_unconfirmed_platforms(dir);
    if set.insert(game_id.to_string()) {
        let list: Vec<String> = set.into_iter().collect();
        write_json(&path_in(dir, "unconfirmed-platforms.json"), &list);
    }
}

pub fn remove_unconfirmed_platform(dir: &Path, game_id: &str) {
    let mut set = load_unconfirmed_platforms(dir);
    if set.remove(game_id) {
        let list: Vec<String> = set.into_iter().collect();
        write_json(&path_in(dir, "unconfirmed-platforms.json"), &list);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_config_is_unpaired_and_points_at_the_site() {
        let c = AppConfig::default();
        assert!(!c.is_paired());
        assert_eq!(c.base(), DEFAULT_API_BASE);
    }

    #[test]
    fn an_empty_token_does_not_count_as_paired() {
        let c = AppConfig { token: Some(String::new()), ..Default::default() };
        assert!(!c.is_paired());
    }

    #[test]
    fn reads_a_hand_written_config_file() {
        // The shape documented for pointing the app at the local stack. A
        // silent parse failure here would fall back to production, which is a
        // confusing bug to chase, so pin the exact JSON.
        let raw = r#"{
            "token":  null,
            "api_base":  "http://localhost:3000"
        }"#;
        let config: AppConfig = serde_json::from_str(raw).expect("should parse");
        assert!(!config.is_paired());
        assert_eq!(config.base(), "http://localhost:3000");
    }

    #[test]
    fn reads_a_config_written_with_a_byte_order_mark() {
        // This is not hypothetical: PowerShell's Set-Content -Encoding utf8
        // writes a BOM, which made a hand-written config silently ignored and
        // sent the app to production instead of the local stack.
        let with_bom = "\u{feff}{\"token\":null,\"api_base\":\"http://localhost:3000\"}";
        assert!(
            serde_json::from_str::<AppConfig>(with_bom).is_err(),
            "serde should still reject a raw BOM — this test guards the strip below",
        );
        let config: AppConfig =
            serde_json::from_str(with_bom.trim_start_matches('\u{feff}')).expect("should parse");
        assert_eq!(config.base(), "http://localhost:3000");
    }

    #[test]
    fn reads_a_paired_config() {
        let raw = r#"{"token":"glk_abc","api_base":"http://localhost:3000"}"#;
        let config: AppConfig = serde_json::from_str(raw).expect("should parse");
        assert!(config.is_paired());
    }

    #[test]
    fn trailing_slashes_are_trimmed_so_urls_do_not_double_up() {
        let c = AppConfig { api_base: "http://localhost:3000/".into(), ..Default::default() };
        assert_eq!(c.base(), "http://localhost:3000");
    }
}
