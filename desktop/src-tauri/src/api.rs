//! Talking to the website's agent API.
//!
//! The server is the authority on everything that matters: which games may be
//! written to, and how many hours a checkpoint is actually worth. This client
//! deliberately holds no rules of its own beyond "ask, and report what came
//! back".

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayingGame {
    pub id: String,
    pub title: String,
    #[serde(rename = "steamAppId")]
    pub steam_app_id: Option<u32>,
    #[serde(default)]
    pub hours: f64,
    #[serde(default)]
    pub linked: bool,
    #[serde(default)]
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    #[serde(default)]
    pub playing: Vec<PlayingGame>,
    /// exe name -> game id
    #[serde(default)]
    pub executables: HashMap<String, String>,
    /// Executables the user has said to never auto-track, from Settings or
    /// the toast's "Not a game" answer on another machine. Checked before
    /// anything else in `run_loop` — an ignored exe is never judged, never
    /// identified, never prompted about.
    #[serde(rename = "ignoredExecutables", default)]
    pub ignored_executables: std::collections::HashSet<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(rename = "accentColour")]
    pub accent_colour: Option<String>,
    /// Brand stops computed by the site, so the app is in the user's colour.
    #[serde(default)]
    pub palette: HashMap<String, [u8; 3]>,
    #[serde(rename = "checkpointMinutes", default = "default_checkpoint")]
    pub checkpoint_minutes: u64,
    #[serde(rename = "pollSeconds", default = "default_poll")]
    pub poll_seconds: u64,
}

fn default_theme() -> String { "system".into() }
fn default_checkpoint() -> u64 { 15 }
fn default_poll() -> u64 { 30 }

#[derive(Debug, Clone, Deserialize)]
pub struct SessionResponse {
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub ignored: bool,
    #[serde(default)]
    pub reason: Option<String>,
    pub title: Option<String>,
    #[serde(rename = "addedHours")]
    pub added_hours: Option<f64>,
    #[serde(rename = "totalHours")]
    pub total_hours: Option<f64>,
}

fn client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder().timeout(TIMEOUT).build()
}

pub async fn fetch_state(base: &str, token: &str) -> Result<AgentState, String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .get(format!("{base}/api/agent/state"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        // The device was revoked from Settings, or the token is stale.
        return Err("unauthorized".into());
    }
    if !res.status().is_success() {
        return Err(format!("state request failed: {}", res.status()));
    }
    res.json::<AgentState>().await.map_err(|e| e.to_string())
}

pub async fn post_session(
    base: &str,
    token: &str,
    payload: &serde_json::Value,
) -> Result<SessionResponse, String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/session"))
        .bearer_auth(token)
        .json(payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("unauthorized".into());
    }
    if !res.status().is_success() {
        return Err(format!("session request failed: {}", res.status()));
    }
    res.json::<SessionResponse>().await.map_err(|e| e.to_string())
}

/// The master list, unless it is unchanged since `etag` — then `Ok(None)`.
pub async fn fetch_detectable(
    base: &str,
    token: &str,
    etag: Option<&str>,
) -> Result<Option<crate::master_list::ListFile>, String> {
    // Longer than the usual timeout: ~400 KB, on whatever connection this is.
    let mut req = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!("{base}/api/agent/detectable"))
        .bearer_auth(token);
    if let Some(etag) = etag {
        req = req.header(reqwest::header::IF_NONE_MATCH, format!("\"{etag}\""));
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(format!("master list request failed: {}", res.status()));
    }
    res.json::<crate::master_list::ListFile>().await.map(Some).map_err(|e| e.to_string())
}

/// Remember that an executable is a particular game. `path_suffix` (the exe
/// and its nearest telling folder, never the full path) feeds the site's
/// admin queue for the master list.
pub async fn post_link(
    base: &str,
    token: &str,
    exe_name: &str,
    game_id: &str,
    path_suffix: Option<&str>,
) -> Result<(), String> {
    let mut body = serde_json::json!({ "exeName": exe_name, "gameId": game_id });
    if let Some(suffix) = path_suffix {
        body["pathSuffix"] = serde_json::json!(suffix);
    }
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/link"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("link request failed: {}", res.status()))
    }
}

/// Forget that an executable is a game.
pub async fn post_unlink(base: &str, token: &str, exe_name: &str) -> Result<(), String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/unlink"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "exeName": exe_name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("unlink request failed: {}", res.status()))
    }
}

/// What the site makes of a Steam app id.
///
/// `result` is one of: `notAGame` (IGDB has no such game — never ask again),
/// `unknown` (the lookup did not get through — try later), `added` (a new
/// Ambient game was created), `tracked` (already trackable) or `untracked`
/// (owned, but completed/backlog/dnf, so left alone).
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct IdentifyResponse {
    pub result: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(rename = "gameId", default)]
    pub game_id: Option<String>,
    /// Only meaningful on an `untracked` result: `"completed"`, `"dnf"` or
    /// `"backlog"` naming exactly which of the three non-trackable statuses
    /// this is, so the agent can ask the matching question — "is this a
    /// replay?" / "resuming?" / "set to Playing or Ambient?". `None`
    /// otherwise.
    #[serde(default)]
    pub resumable: Option<String>,
}

/// What to identify a running game by — however the agent came to recognise it.
pub enum IdentifyBy<'a> {
    /// Exact: the registry's app id maps to an exact IGDB game, or nothing.
    SteamAppId(u32),
    /// A search, not a lookup — a launcher's own manifest names the game
    /// authoritatively, or was guessed from the executable's own name, but
    /// IGDB keeps no cross-reference for either, so it is only trusted on an
    /// exact match.
    Title(&'a str),
    /// A person picked this exact game themselves, from a real search result
    /// (`search_games` below) — nothing left to resolve or verify.
    IgdbId { id: u32, title: &'a str },
    /// The program's path matched a master-list entry on this PC
    /// (`master_list.rs`). The row id is all the server needs.
    Detectable(u64),
}

/// Ask what a running game is, and have it filed if it is new.
///
/// `exe_name` and `platform` ride along so the server can remember the
/// executable → game link the same way a manual "Link a game" would. Without
/// it, a non-Steam game recognised once has no way to be recognised again:
/// there is no app id to match on next poll, so the executable would fall
/// straight back to the "is this a game?" prompt on the very next tick.
pub async fn post_identify(
    base: &str,
    token: &str,
    by: IdentifyBy<'_>,
    exe_name: &str,
    platform: &str,
    path_suffix: Option<&str>,
) -> Result<IdentifyResponse, String> {
    let mut body = match by {
        IdentifyBy::SteamAppId(id) => serde_json::json!({ "steamAppId": id }),
        IdentifyBy::Title(title) => serde_json::json!({ "titleGuess": title }),
        IdentifyBy::IgdbId { id, title } => serde_json::json!({ "igdbId": id, "title": title }),
        IdentifyBy::Detectable(id) => serde_json::json!({ "detectableId": id }),
    };
    body["exeName"] = serde_json::json!(exe_name);
    body["platform"] = serde_json::json!(platform);
    if let Some(suffix) = path_suffix {
        body["pathSuffix"] = serde_json::json!(suffix);
    }
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/identify"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("identify failed: {}", res.status()));
    }
    res.json::<IdentifyResponse>().await.map_err(|e| e.to_string())
}

/// One result from `search_games` — the same shape the website's own add-game
/// search box renders from (`lib/rawg.ts`'s `RawgSearchResult`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: u32,
    pub name: String,
    #[serde(default)]
    pub released: Option<String>,
    #[serde(default)]
    pub background_image: Option<String>,
    #[serde(default)]
    pub cover_image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    results: Vec<SearchResult>,
}

/// Search for a game by text, for the "add it as a new game" panel. Unlike
/// `post_identify`, this returns real candidates for a person to choose
/// from rather than collapsing to a single exact match or nothing.
pub async fn search_games(base: &str, token: &str, query: &str) -> Result<Vec<SearchResult>, String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .get(format!("{base}/api/agent/search"))
        .query(&[("q", query)])
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("search failed: {}", res.status()));
    }
    Ok(res.json::<SearchResponse>().await.map_err(|e| e.to_string())?.results)
}

/// One paired PC, as the Settings page's own Devices section shows it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub label: String,
    #[serde(rename = "lastSeenAt", default)]
    pub last_seen_at: Option<String>,
    #[serde(rename = "isThisDevice", default)]
    pub is_this_device: bool,
}

#[derive(Debug, Deserialize)]
struct DevicesResponse {
    #[serde(default)]
    devices: Vec<DeviceInfo>,
}

/// Every PC paired to this account — the native Devices panel's list.
pub async fn list_devices(base: &str, token: &str) -> Result<Vec<DeviceInfo>, String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .get(format!("{base}/api/agent/devices"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("unauthorized".into());
    }
    if !res.status().is_success() {
        return Err(format!("devices request failed: {}", res.status()));
    }
    Ok(res.json::<DevicesResponse>().await.map_err(|e| e.to_string())?.devices)
}

#[derive(Debug, Deserialize)]
struct NewDeviceResponse {
    token: String,
}

/// Issue a token for pairing a *different* PC, from this already-paired one.
pub async fn create_device_token(base: &str, token: &str, label: &str) -> Result<String, String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/devices"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "label": label }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("could not create device: {body}"));
    }
    Ok(res.json::<NewDeviceResponse>().await.map_err(|e| e.to_string())?.token)
}


/// Record that an executable should never be auto-tracked — the toast's
/// "Not a game" answer, mirrored to the server so it shows up in Settings
/// rather than living only in this machine's local asked.json.
pub async fn post_ignore(base: &str, token: &str, exe_name: &str) -> Result<(), String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/ignore"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "exeName": exe_name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("ignore request failed: {}", res.status()))
    }
}

/// Confirm or correct a game's platform, from the platform-confirm prompt.
pub async fn post_platform(base: &str, token: &str, game_id: &str, platform: &str) -> Result<(), String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/platform"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "gameId": game_id, "platform": platform }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("platform request failed: {}", res.status()))
    }
}

/// What `/api/agent/resume` actually did — the game that's now live, which
/// may be the same `game_id` the prompt named (DNF, updated in place) or a
/// brand-new one (Completed, a fresh row for the replay).
#[derive(Debug, Clone, Deserialize)]
pub struct ResumeResponse {
    #[serde(rename = "gameId")]
    pub game_id: String,
    pub title: String,
}

/// Act on the "is this a replay?" / "are you resuming?" / "set to Playing or
/// Ambient?" prompt. `status` is only meaningful (and required by the
/// server) when `kind` is `"backlog"` — the other two kinds have exactly
/// one possible outcome, so there's nothing for the caller to choose.
pub async fn post_resume(
    base: &str,
    token: &str,
    game_id: &str,
    kind: &str,
    status: Option<&str>,
    exe_name: &str,
) -> Result<ResumeResponse, String> {
    let mut body = serde_json::json!({ "gameId": game_id, "kind": kind });
    if let Some(status) = status {
        body["status"] = serde_json::json!(status);
    }
    if !exe_name.is_empty() {
        body["exeName"] = serde_json::json!(exe_name);
    }
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/resume"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("resume request failed: {}", res.status()));
    }
    res.json::<ResumeResponse>().await.map_err(|e| e.to_string())
}

/// Revoke a paired PC — including, legitimately, this very one.
pub async fn revoke_device(base: &str, token: &str, device_id: &str) -> Result<(), String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/devices/revoke"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "deviceId": device_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("revoke failed: {}", res.status()))
    }
}
