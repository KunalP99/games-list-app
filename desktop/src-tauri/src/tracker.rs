//! The watching loop: notice a game start, time it, checkpoint it, notice it
//! stop.
//!
//! All the rules that could cost someone hours live on the server. This keeps
//! only what a client must: when a session started, and what has been sent.

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::api::{self, AgentState, PlayingGame};
use crate::config::{self, AppConfig};
use crate::detect;
use crate::matching;
use crate::toast;

/// A game currently being timed.
#[derive(Debug, Clone)]
pub struct Session {
    pub game_id: String,
    pub title: String,
    pub client_session_id: String,
    pub started_at: DateTime<Utc>,
    pub started_instant: Instant,
    pub last_checkpoint: Instant,
    pub steam_app_id: Option<u32>,
    pub exe_name: Option<String>,
}

impl Session {
    pub fn minutes(&self) -> u64 {
        self.started_instant.elapsed().as_secs() / 60
    }

    fn payload(&self, final_write: bool) -> serde_json::Value {
        let mut payload = serde_json::json!({
            "clientSessionId": self.client_session_id,
            "minutes": self.minutes(),
            "startedAt": self.started_at.to_rfc3339(),
        });
        if let Some(app_id) = self.steam_app_id {
            payload["steamAppId"] = serde_json::json!(app_id);
        }
        if let Some(exe) = &self.exe_name {
            payload["exeName"] = serde_json::json!(exe);
        }
        if final_write {
            payload["endedAt"] = serde_json::json!(Utc::now().to_rfc3339());
        }
        payload
    }
}

/// Something that looks like a game but has not been linked to one yet.
#[derive(Debug, Clone, Serialize)]
pub struct PendingPrompt {
    pub exe_name: String,
    /// The game the name actually resembles, where one does; otherwise the
    /// first Playing game with no link, as somewhere for a picker to start.
    pub suggested_game_id: String,
    pub suggested_title: String,
    /// Whether `suggested_title` is worth putting in the question. False means
    /// nothing resembled the name, so the toast asks *which* game it is rather
    /// than naming one it would usually get wrong.
    pub confident: bool,
}

#[derive(Default)]
pub struct Shared {
    pub state: Option<AgentState>,
    pub session: Option<Session>,
    pub last_sync: Option<DateTime<Utc>>,
    pub queued: usize,
    pub last_error: Option<String>,
    pub pending_prompt: Option<PendingPrompt>,
    /// Set when something happened off-app that the cached state cannot
    /// know about — linking a game on the website, for instance. The loop
    /// re-reads on its next tick instead of waiting out the cache.
    pub force_refresh: bool,
}

pub struct Tracker {
    pub shared: Mutex<Shared>,
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
}

impl Tracker {
    pub fn new(data_dir: PathBuf) -> Self {
        let config = config::load(&data_dir);
        Self { shared: Mutex::new(Shared::default()), config: Mutex::new(config), data_dir }
    }

    pub fn snapshot_config(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Tell the UI to re-read the status.
fn ping_ui(app: &AppHandle) {
    let _ = app.emit("status-changed", ());
}

pub async fn run_loop(app: AppHandle) {
    // A short first delay so the window is up before anything pops.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let mut system = detect::new_system();
    // Remembers which processes have been judged, so polling every ten
    // seconds does not re-walk the same programs' modules forever.
    let mut judge = detect::GameJudge::default();
    let mut state_fetched: Option<Instant> = None;

    loop {
        let tracker = app.state::<Tracker>();
        let config = tracker.snapshot_config();

        if !config.is_paired() {
            // Nothing to watch for until the user pairs.
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            continue;
        }
        let token = config.token.clone().unwrap_or_default();
        let base = config.base();

        // ── Refresh what we are watching for ────────────────────────────────
        let forced = {
            let mut shared = tracker.shared.lock().unwrap();
            std::mem::replace(&mut shared.force_refresh, false)
        };
        // A minute, not five: linking a game on the website is invisible to
        // the app until it re-reads, and five minutes of the status screen
        // still saying "Not linked" reads as the link having failed.
        let stale = state_fetched.is_none_or(|t| t.elapsed().as_secs() > 60);
        if stale || forced {
            match api::fetch_state(&base, &token).await {
                Ok(state) => {
                    state_fetched = Some(Instant::now());
                    let mut shared = tracker.shared.lock().unwrap();
                    shared.state = Some(state);
                    shared.last_error = None;
                    drop(shared);
                    ping_ui(&app);
                }
                Err(err) => {
                    let mut shared = tracker.shared.lock().unwrap();
                    shared.last_error = Some(err);
                    drop(shared);
                    ping_ui(&app);
                }
            }
        }

        flush_queue(&app, &base, &token).await;

        // ── What is running? ────────────────────────────────────────────────
        let candidates = detect::candidates(&mut system);
        judge.retain_running(&candidates.iter().map(|c| c.pid).collect());
        let steam_app_id = detect::steam_running_app_id();

        let (playing, executables) = {
            let shared = tracker.shared.lock().unwrap();
            match &shared.state {
                Some(state) => (state.playing.clone(), state.executables.clone()),
                None => (Vec::new(), HashMap::new()),
            }
        };

        let mut matched: Option<(PlayingGame, Option<u32>, Option<String>)> = None;

        if let Some(app_id) = steam_app_id {
            if let Some(game) = playing.iter().find(|g| g.steam_app_id == Some(app_id)) {
                matched = Some((game.clone(), Some(app_id), None));
            }
        }
        if matched.is_none() {
            for candidate in &candidates {
                if let Some(game_id) = executables.get(&candidate.exe_name) {
                    if let Some(game) = playing.iter().find(|g| &g.id == game_id) {
                        matched = Some((game.clone(), None, Some(candidate.exe_name.clone())));
                        break;
                    }
                }
            }
        }

        // ── Start / stop ────────────────────────────────────────────────────
        let current_game_id = tracker.shared.lock().unwrap().session.as_ref().map(|s| s.game_id.clone());

        match (&matched, &current_game_id) {
            (Some((game, _, _)), Some(current)) if &game.id == current => {}
            (Some((game, app_id, exe)), _) => {
                if current_game_id.is_some() {
                    stop_session(&app, &base, &token).await;
                }
                let session = Session {
                    game_id: game.id.clone(),
                    title: game.title.clone(),
                    client_session_id: uuid::Uuid::new_v4().to_string(),
                    started_at: Utc::now(),
                    started_instant: Instant::now(),
                    last_checkpoint: Instant::now(),
                    steam_app_id: *app_id,
                    exe_name: exe.clone(),
                };
                tracker.shared.lock().unwrap().session = Some(session);
                log::info!("started tracking {} (steam {:?}, exe {:?})", game.title, app_id, exe);
                notify(&app, "Now tracking", &format!("{} — your hours are being logged.", game.title));
                ping_ui(&app);
            }
            (None, Some(_)) => {
                stop_session(&app, &base, &token).await;
            }
            (None, None) => {
                maybe_prompt(&app, &candidates, &playing, &mut judge);
            }
        }

        // ── Checkpoint ──────────────────────────────────────────────────────
        let due = {
            let shared = tracker.shared.lock().unwrap();
            let minutes = shared.state.as_ref().map(|s| s.checkpoint_minutes).unwrap_or(15);
            shared
                .session
                .as_ref()
                .is_some_and(|s| s.last_checkpoint.elapsed().as_secs() >= minutes * 60)
        };
        if due {
            checkpoint(&app, &base, &token).await;
        }

        // Read the interval here rather than at the top of the loop: on the
        // first pass the state has not been fetched yet, so taking it earlier
        // meant the first sleep always used the fallback. That made the first
        // detection take 26s when the configured interval was 10.
        let poll_seconds = tracker
            .shared
            .lock()
            .unwrap()
            .state
            .as_ref()
            .map(|s| s.poll_seconds)
            .unwrap_or(10);
        tokio::time::sleep(std::time::Duration::from_secs(poll_seconds)).await;
    }
}

async fn checkpoint(app: &AppHandle, base: &str, token: &str) {
    let tracker = app.state::<Tracker>();
    let payload = {
        let shared = tracker.shared.lock().unwrap();
        shared.session.as_ref().map(|s| s.payload(false))
    };
    let Some(payload) = payload else { return };

    send_or_queue(app, base, token, payload).await;
    let mut shared = tracker.shared.lock().unwrap();
    if let Some(session) = shared.session.as_mut() {
        session.last_checkpoint = Instant::now();
    }
    drop(shared);
    ping_ui(app);
}

pub async fn stop_session(app: &AppHandle, base: &str, token: &str) {
    let tracker = app.state::<Tracker>();
    let (payload, title) = {
        let mut shared = tracker.shared.lock().unwrap();
        match shared.session.take() {
            Some(session) => (session.payload(true), session.title),
            None => return,
        }
    };

    log::info!("stopping tracking for {title}");
    let result = send_or_queue(app, base, token, payload).await;
    let (heading, body) = match result {
        Some(res) if res.ok => (
            "Stopped tracking",
            format!(
                "{} — {}h added, now {}h.",
                res.title.unwrap_or(title),
                res.added_hours.unwrap_or(0.0),
                res.total_hours.unwrap_or(0.0)
            ),
        ),
        // The server refused it — almost always because the game is no longer
        // set to Playing. Say so, rather than claiming hours were saved.
        Some(res) if res.ignored => (
            "Not tracked",
            match res.reason.as_deref() {
                Some("not_playing") => format!(
                    "{} isn't set to Playing, so no hours were added.",
                    res.title.unwrap_or(title)
                ),
                _ => format!("{title} — nothing was logged."),
            },
        ),
        _ => ("Stopped tracking", format!("{title} — session saved.")),
    };
    notify(app, heading, &body);
    ping_ui(app);
}

/// Send a checkpoint, or keep it for later if the site cannot be reached.
async fn send_or_queue(
    app: &AppHandle,
    base: &str,
    token: &str,
    payload: serde_json::Value,
) -> Option<api::SessionResponse> {
    let tracker = app.state::<Tracker>();
    match api::post_session(base, token, &payload).await {
        Ok(res) => {
            let mut shared = tracker.shared.lock().unwrap();
            shared.last_sync = Some(Utc::now());
            shared.last_error = None;
            Some(res)
        }
        Err(err) => {
            let dir = tracker.data_dir.clone();
            let mut queue = config::load_queue(&dir);
            queue.push(payload);
            config::save_queue(&dir, &queue);

            let mut shared = tracker.shared.lock().unwrap();
            shared.queued = queue.len();
            shared.last_error = Some(err);
            None
        }
    }
}

async fn flush_queue(app: &AppHandle, base: &str, token: &str) {
    let tracker = app.state::<Tracker>();
    let dir = tracker.data_dir.clone();
    let queue = config::load_queue(&dir);
    if queue.is_empty() {
        return;
    }

    let mut remaining = Vec::new();
    for item in queue {
        // Replays are harmless: the server applies only the delta it has not
        // already applied for this session id.
        if api::post_session(base, token, &item).await.is_err() {
            remaining.push(item);
        }
    }
    config::save_queue(&dir, &remaining);

    let mut shared = tracker.shared.lock().unwrap();
    shared.queued = remaining.len();
    if remaining.is_empty() {
        shared.last_sync = Some(Utc::now());
    }
    drop(shared);
    ping_ui(app);
}

/// Offer to link an unrecognised game — at most once per executable, ever.
fn maybe_prompt(
    app: &AppHandle,
    candidates: &[detect::Candidate],
    playing: &[PlayingGame],
    judge: &mut detect::GameJudge,
) {
    let tracker = app.state::<Tracker>();
    if tracker.shared.lock().unwrap().pending_prompt.is_some() {
        return;
    }

    // Nothing to link it to — say nothing at all.
    if !playing.iter().any(|g| !g.linked) {
        return;
    }

    let dir = tracker.data_dir.clone();
    let asked = config::load_asked(&dir);

    for candidate in candidates {
        if asked.contains(&candidate.exe_name) {
            continue;
        }
        if !judge.judge(candidate) {
            continue;
        }

        // Name the likeliest game rather than whichever happens to be first:
        // "vampiresurvivors.exe" should ask about Vampire Survivors even if
        // three other games are also unlinked.
        let unlinked: Vec<&PlayingGame> = playing.iter().filter(|g| !g.linked).collect();
        let matched = matching::best_title(
            &candidate.exe_name,
            unlinked.iter().map(|g| g.title.as_str()),
        )
        .filter(|(_, points)| *points >= matching::CONFIDENT)
        .and_then(|(title, _)| unlinked.iter().find(|g| g.title == title))
        .copied();

        // Nothing resembled it, but the gates have already said it looks like a
        // game, so it is still worth one question — just not one that names a
        // game at random.
        let confident = matched.is_some();
        let Some(suggestion) = matched.or_else(|| unlinked.first().copied()) else {
            return;
        };

        config::add_asked(&dir, &candidate.exe_name);
        let prompt = PendingPrompt {
            exe_name: candidate.exe_name.clone(),
            suggested_game_id: suggestion.id.clone(),
            suggested_title: suggestion.title.clone(),
            confident,
        };
        tracker.shared.lock().unwrap().pending_prompt = Some(prompt.clone());
        // Asked in the corner of the screen, with the buttons on it. The
        // status screen keeps the same question, for anyone who misses it.
        toast::show(app, &prompt);
        ping_ui(app);
        return;
    }
}
