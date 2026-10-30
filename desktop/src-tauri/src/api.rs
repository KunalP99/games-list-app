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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    #[serde(default)]
    pub playing: Vec<PlayingGame>,
    /// exe name -> game id
    #[serde(default)]
    pub executables: HashMap<String, String>,
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

/// Remember that an executable is a particular game.
pub async fn post_link(
    base: &str,
    token: &str,
    exe_name: &str,
    game_id: &str,
) -> Result<(), String> {
    let res = client()
        .map_err(|e| e.to_string())?
        .post(format!("{base}/api/agent/link"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "exeName": exe_name, "gameId": game_id }))
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
/// (owned, but completed/backlog, so left alone).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct IdentifyResponse {
    pub result: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

/// What to identify a running game by — however the agent came to recognise it.
pub enum IdentifyBy<'a> {
    /// Exact: the registry's app id maps to an exact IGDB game, or nothing.
    SteamAppId(u32),
    /// A search, not a lookup — a launcher's own manifest names the game
    /// authoritatively, but IGDB keeps no cross-reference for these stores.
    Title(&'a str),
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
) -> Result<IdentifyResponse, String> {
    let mut body = match by {
        IdentifyBy::SteamAppId(id) => serde_json::json!({ "steamAppId": id }),
        IdentifyBy::Title(title) => serde_json::json!({ "titleGuess": title }),
    };
    body["exeName"] = serde_json::json!(exe_name);
    body["platform"] = serde_json::json!(platform);
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
