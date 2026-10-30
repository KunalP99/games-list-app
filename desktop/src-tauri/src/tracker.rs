//! The watching loop: notice a game start, time it, checkpoint it, notice it
//! stop.
//!
//! All the rules that could cost someone hours live on the server. This keeps
//! only what a client must: when a session started, and what has been sent.

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::api::{self, AgentState, PlayingGame};
use crate::config::{self, AppConfig};
use crate::detect;
use crate::ea;
use crate::launchers;
use crate::matching;
use crate::steam;
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
    /// Executables not to ask about again *this run*.
    ///
    /// Separate from `asked.json`, which is forever and is written only when
    /// someone actually says "not a game". This covers the softer cases — the
    /// question was sent to the link panel, say — so the toast does not
    /// reappear the moment it is dealt with, while a question that was never
    /// answered still comes back next time the app starts.
    pub skip_for_now: HashSet<String>,
    /// Steam app ids already put to the site this run, so a game that is
    /// running but owned-and-not-trackable (completed, say) is not asked about
    /// on every single poll.
    pub identified: HashSet<u32>,
    /// The same, for executables identified by a launcher-reported title
    /// rather than a Steam app id — keyed by exe name, since there is no id.
    pub identified_titles: HashSet<String>,
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
                // Without this, play_sessions gets no row — and the site no
                // sign anyone is playing — until the first periodic checkpoint,
                // up to checkpoint_minutes later. Sent immediately so a "now
                // playing" badge means something close to the moment it starts.
                checkpoint(&app, &base, &token).await;
                ping_ui(&app);
            }
            (None, Some(_)) => {
                stop_session(&app, &base, &token).await;
            }
            (None, None) => {
                // A Steam game can be identified exactly, so try that first:
                // it needs no executable link and no question. Epic's and
                // EA's own local records are the next best thing, for
                // anything Steam didn't catch. Only when all of these come to
                // nothing is the user asked anything.
                let identified = identify_steam_games(&app, &base, &token, &candidates, &mut judge).await
                    || identify_other_launchers(&app, &base, &token, &candidates, &mut judge).await
                    || identify_ea_games(&app, &base, &token, &candidates, &mut judge).await;
                if identified {
                    // Something was filed; re-read so the next tick can track
                    // it rather than waiting out the state cache.
                    tracker.shared.lock().unwrap().force_refresh = true;
                } else {
                    maybe_prompt(&app, &candidates, &playing, &mut judge);
                }
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

/// Identify running Steam games with the site, filing any it does not know.
///
/// This is the path that needs no question at all: a Steam install folder
/// gives an exact app id, the site turns that into the exact IGDB game, and a
/// game the user does not own is filed as Ambient so its hours count from the
/// first minute. The "is this your game?" prompt is only for what this cannot
/// reach — anything outside a Steam library.
///
/// Returns true if something was filed or recognised, so the caller knows to
/// re-read rather than fall through to asking a question about it.
async fn identify_steam_games(
    app: &AppHandle,
    base: &str,
    token: &str,
    candidates: &[detect::Candidate],
    judge: &mut detect::GameJudge,
) -> bool {
    let tracker = app.state::<Tracker>();
    let dir = tracker.data_dir.clone();
    // `asked` doubles as the never-again list for app ids the site has called
    // not-a-game, keyed by executable so one entry covers both paths.
    let asked = config::load_asked(&dir);

    for candidate in candidates {
        if asked.contains(&candidate.exe_name) {
            continue;
        }
        let Some(path) = candidate.path.as_deref() else { continue };
        let Some((app_id, _steam_name)) = steam::app_id_for_exe(path) else { continue };

        {
            let shared = tracker.shared.lock().unwrap();
            if shared.identified.contains(&app_id) {
                continue;
            }
        }

        // The gates still apply. They cost nothing here and keep installers
        // and redistributables — which live in the same folders — from being
        // sent anywhere.
        if !judge.judge(candidate) {
            continue;
        }

        let response = match api::post_identify(
            base, token, api::IdentifyBy::SteamAppId(app_id), &candidate.exe_name, "Steam",
        ).await {
            Ok(r) => r,
            Err(err) => {
                // Offline, or the site is down. Decide nothing and try again
                // on a later tick.
                log::warn!("could not identify steam app {app_id}: {err}");
                continue;
            }
        };

        match response.result.as_str() {
            "notAGame" => {
                // IGDB has no such game. This is what keeps Blender and
                // Wallpaper Engine quiet without a hand-written list.
                log::info!("steam app {app_id} ({}) is not a game", candidate.exe_name);
                config::add_asked(&dir, &candidate.exe_name);
                tracker.shared.lock().unwrap().identified.insert(app_id);
            }
            "added" => {
                let title = response.title.unwrap_or_else(|| candidate.exe_name.clone());
                log::info!("added {title} as an ambient game (steam {app_id})");
                // Not inserted into `identified`: a game_executables link now
                // exists, so the main matching loop finds it directly and
                // identify is never reached again while that link holds. If
                // the link is ever removed — the user deletes the game to
                // retest, say — this must be free to try again, not stuck
                // believing it already settled the question.
                notify(
                    app,
                    "Now tracking",
                    &format!("{title} — added to your Ambient games."),
                );
                return true;
            }
            "tracked" => {
                // Same reasoning as "added": nothing to remember, the link
                // already does the remembering.
                return true;
            }
            "untracked" => {
                // Owned, but completed, dropped or still in the backlog.
                // Moving it is the user's call, so say nothing and do not ask
                // about it again this run. Worth remembering here, unlike
                // above: there is no link, and nothing about this will change
                // without the user acting on the site, so asking again next
                // poll would just be noise.
                log::info!(
                    "steam app {app_id} is owned but {}; leaving it alone",
                    response.status.as_deref().unwrap_or("not trackable"),
                );
                tracker.shared.lock().unwrap().identified.insert(app_id);
            }
            // "unknown", or anything a newer site version returns: decide
            // nothing, and leave it to be retried.
            _ => {}
        }
    }
    false
}

/// The same idea as [`identify_steam_games`], for launchers that are not
/// Steam — currently Epic. Only reached once the Steam path has already come
/// up empty for a candidate, since a game can only ever be one or the other.
///
/// Unlike Steam's app id, a launcher's display name is not a key into
/// anything IGDB keeps — identifying by it is a search, not a lookup, so the
/// server never answers `notAGame` here. A miss just means "inconclusive":
/// nothing is remembered, and the executable falls through to the ordinary
/// heuristic prompt exactly as if this function did not exist.
/// Identify by a launcher-reported title, generic over whatever local source
/// supplies one — Epic's manifests, EA's registry, and (per the plan) GOG's
/// local database next. Only the resolver and the platform label differ
/// between callers; everything about *how* an identification is handled —
/// the asked/identified-titles bookkeeping, the gates, the result handling —
/// is identical regardless of where the title came from, so it lives here
/// exactly once rather than once per launcher.
async fn identify_by_title(
    app: &AppHandle,
    base: &str,
    token: &str,
    candidates: &[detect::Candidate],
    judge: &mut detect::GameJudge,
    platform: &str,
    resolve: impl Fn(&str) -> Option<String>,
) -> bool {
    let tracker = app.state::<Tracker>();
    let dir = tracker.data_dir.clone();
    let asked = config::load_asked(&dir);

    for candidate in candidates {
        if asked.contains(&candidate.exe_name) {
            continue;
        }
        let Some(path) = candidate.path.as_deref() else { continue };
        let Some(title) = resolve(path) else { continue };

        {
            let shared = tracker.shared.lock().unwrap();
            if shared.identified_titles.contains(&candidate.exe_name) {
                continue;
            }
        }

        if !judge.judge(candidate) {
            continue;
        }

        let response = match api::post_identify(
            base, token, api::IdentifyBy::Title(&title), &candidate.exe_name, platform,
        ).await {
            Ok(r) => r,
            Err(err) => {
                log::warn!("could not identify \"{title}\": {err}");
                continue;
            }
        };

        match response.result.as_str() {
            "added" => {
                let shown = response.title.unwrap_or(title);
                log::info!("added {shown} as an ambient game (by name: \"{shown}\")");
                // The link this created is what keeps this from being
                // re-asked, not identified_titles — which must stay
                // retryable if that link ever goes away (deleted to retest,
                // say; confirmed live, twice, the night this was fixed).
                notify(app, "Now tracking", &format!("{shown} — added to your Ambient games."));
                return true;
            }
            "tracked" => {
                return true;
            }
            "untracked" => {
                // Worth remembering: no link exists, and nothing changes here
                // without the user acting on the site.
                log::info!(
                    "\"{title}\" is owned but {}; leaving it alone",
                    response.status.as_deref().unwrap_or("not trackable"),
                );
                tracker.shared.lock().unwrap().identified_titles.insert(candidate.exe_name.clone());
            }
            // "unknown" (no exact IGDB match, or the request failed): decide
            // nothing — not even remembered — and let the heuristic prompt
            // offer the usual "is this a game?" toast instead.
            _ => {}
        }
    }
    false
}

async fn identify_other_launchers(
    app: &AppHandle,
    base: &str,
    token: &str,
    candidates: &[detect::Candidate],
    judge: &mut detect::GameJudge,
) -> bool {
    let epic_games = launchers::epic_games();
    if epic_games.is_empty() {
        return false;
    }
    identify_by_title(app, base, token, candidates, judge, "Epic Games", |path| {
        launchers::display_name_for_exe(path, &epic_games)
    })
    .await
}

async fn identify_ea_games(
    app: &AppHandle,
    base: &str,
    token: &str,
    candidates: &[detect::Candidate],
    judge: &mut detect::GameJudge,
) -> bool {
    // No central list to check up front, unlike Epic/Steam: EA App's own
    // registry turned out not to carry a live install record (see ea.rs's
    // module doc), so this looks for installerdata.xml next to each
    // candidate directly rather than against a list gathered once per tick.
    identify_by_title(app, base, token, candidates, judge, "EA App", |path| {
        ea::display_name_for_exe(path)
    })
    .await
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
    let skip = tracker.shared.lock().unwrap().skip_for_now.clone();

    for candidate in candidates {
        if asked.contains(&candidate.exe_name) || skip.contains(&candidate.exe_name) {
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

        // Deliberately not recorded as asked here. Posing a question is not
        // the same as having it answered: a toast nobody saw, or one lost to
        // the app restarting, used to mean that program was never offered
        // again. It is written when someone actually answers.
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
