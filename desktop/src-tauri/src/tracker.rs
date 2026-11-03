//! The watching loop: notice a game start, time it, checkpoint it, notice it
//! stop.
//!
//! All the rules that could cost someone hours live on the server. This keeps
//! only what a client must: when a session started, and what has been sent.

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::api::{self, AgentState, PlayingGame};
use crate::config::{self, AppConfig};
use crate::detect;
use crate::ea;
use crate::launchers;
use crate::master_list;
use crate::matching;
use crate::steam;
use crate::toast;

/// How long an inconclusive identify answer is trusted before asking again.
const RETRY_AFTER: Duration = Duration::from_secs(10 * 60);
/// How often to check the site for a newer master list.
const LIST_CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
/// After a failed list check — offline, say — try again sooner than a day.
const LIST_RETRY_EVERY: Duration = Duration::from_secs(60 * 60);

/// Whether `exe_name` is still backing off from an inconclusive identify.
fn backing_off(app: &AppHandle, exe_name: &str) -> bool {
    let tracker = app.state::<Tracker>();
    let shared = tracker.shared.lock().unwrap();
    shared.retry_after.get(exe_name).is_some_and(|t| Instant::now() < *t)
}

/// Don't put `exe_name` to the site again for a while.
fn back_off(app: &AppHandle, exe_name: &str) {
    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    let now = Instant::now();
    // Forget expired entries so the map can't grow for the life of the process.
    shared.retry_after.retain(|_, t| *t > now);
    shared.retry_after.insert(exe_name.to_string(), now + RETRY_AFTER);
}

/// Load the cached master list on first use, then check the site for a newer
/// one. Returns when the next check is due. A failure keeps whatever list is
/// already in memory — the cached copy is the snapshot.
async fn refresh_master_list(app: &AppHandle, base: &str, token: &str) -> Instant {
    let tracker = app.state::<Tracker>();
    let dir = tracker.data_dir.clone();

    let current_version = {
        let mut shared = tracker.shared.lock().unwrap();
        if shared.master_list.is_none() {
            if let Some(file) = master_list::load_cache(&dir) {
                let list = master_list::MasterList::from_file(file);
                log::info!("loaded cached master list v{} ({} entries)", list.version, list.len());
                shared.master_list = Some(Arc::new(list));
            }
        }
        shared.master_list.as_ref().map(|l| l.version.clone())
    };

    match api::fetch_detectable(base, token, current_version.as_deref()).await {
        Ok(None) => Instant::now() + LIST_CHECK_EVERY,
        Ok(Some(file)) => {
            master_list::save_cache(&dir, &file);
            let list = master_list::MasterList::from_file(file);
            log::info!("master list updated to v{} ({} entries)", list.version, list.len());
            tracker.shared.lock().unwrap().master_list = Some(Arc::new(list));
            Instant::now() + LIST_CHECK_EVERY
        }
        Err(err) => {
            log::warn!("could not check for a newer master list: {err}");
            Instant::now() + LIST_RETRY_EVERY
        }
    }
}

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

/// A game just filed for the first time, waiting on the platform-confirm
/// prompt. First set right after a successful identification (`"added"`) —
/// the opposite moment from `PendingPrompt`, which only exists when
/// identification *failed* — so the two are always mutually exclusive.
///
/// Unlike `PendingPrompt`/`PendingResumePrompt`, this one is also re-set on
/// every tick the game is matched as running (see `run_loop`'s start/stop
/// block) for as long as `config::load_unconfirmed_platforms` still lists its
/// `game_id` — so closing the × on the toast (which leaves the prompt
/// pending, same as the other two) doesn't mean it follows the user around:
/// it disappears the moment the game closes, and comes back the next time
/// it's launched, until `set_platform` actually answers it and removes the
/// game from that list for good.
#[derive(Debug, Clone, Serialize)]
pub struct PendingPlatformPrompt {
    pub game_id: String,
    pub title: String,
    /// Whatever the identify call already set — "Steam", "Epic Games",
    /// "EA App", or "PC (Windows)" when there was no stronger signal. The
    /// prompt's dropdown starts here so confirming it is a single click.
    pub current_platform: String,
}

/// A running game that's already in the library as Completed, DNF, or
/// Backlog — identified, but not currently trackable, so moving it is
/// asked about rather than done silently. Set right after an
/// `/api/agent/identify` call comes back `untracked` with its `resumable`
/// field set; cleared the moment the user answers
/// (`respond_to_resume_prompt`), never cached as asked/skipped the way an
/// ordinary `untracked` match is, so an unanswered prompt simply re-asks on
/// the next poll rather than going silent.
#[derive(Debug, Clone, Serialize)]
pub struct PendingResumePrompt {
    pub exe_name: String,
    pub game_id: String,
    pub title: String,
    /// `"completed"` — accepting creates a brand-new row (a replay).
    /// `"dnf"` — accepting updates this same row in place (resuming).
    /// `"backlog"` — accepting updates this same row in place too, but the
    /// target status (`"playing"` or `"ambient"`) is the user's own choice,
    /// since unlike the other two there's no single obvious answer.
    pub kind: String,
}

#[derive(Default)]
pub struct Shared {
    pub state: Option<AgentState>,
    pub session: Option<Session>,
    pub last_sync: Option<DateTime<Utc>>,
    pub queued: usize,
    pub last_error: Option<String>,
    pub pending_prompt: Option<PendingPrompt>,
    pub pending_platform_prompt: Option<PendingPlatformPrompt>,
    pub pending_resume_prompt: Option<PendingResumePrompt>,
    /// Executables not to ask about again *this run*.
    ///
    /// Separate from `asked.json`, which is forever and is written only when
    /// someone actually says "not a game". This covers the softer cases — the
    /// question was sent to the link panel, say — so the toast does not
    /// reappear the moment it is dealt with, while a question that was never
    /// answered still comes back next time the app starts.
    pub skip_for_now: HashSet<String>,
    /// Steam app ids already put to the site this run, so a game that is
    /// running but owned-and-not-trackable (backlog, say) is not asked about
    /// on every single poll. Cleared alongside `state` on every refresh
    /// (`run_loop`'s `stale`/`forced` block), not held for the rest of the
    /// process — a game owned-and-not-trackable a minute ago can become
    /// trackable because the user changed its status on the website while
    /// this kept running in the background, and nothing else would notice
    /// that short of a restart. Confirmed live: flipping a DNF game straight
    /// back to Playing on the website, while the agent was already running,
    /// was silently invisible to it until this was added — the exact "is
    /// the game ignored entirely?" scenario this guards against.
    pub identified: HashSet<u32>,
    /// The same, for executables identified by a launcher-reported title
    /// rather than a Steam app id — keyed by exe name, since there is no id.
    pub identified_titles: HashSet<String>,
    /// Exe name -> when it may be put to `/api/agent/identify` again, after
    /// an inconclusive answer (`unknown`) or a failed request. Without this
    /// an unresolvable program was re-sent every poll for as long as it ran
    /// (tracker review T-H2). Time-based rather than cleared on each state
    /// refresh, which happens every minute — far too often for this.
    pub retry_after: HashMap<String, Instant>,
    /// The master list (`master_list.rs`), once loaded from the cache or the
    /// site. `None` until then; matching simply skips that step meanwhile.
    pub master_list: Option<Arc<master_list::MasterList>>,
    /// Executables whose *toast* the user closed with its × — the question
    /// itself stays pending on the status screen, deliberately, so an
    /// accidental close doesn't lose it.
    ///
    /// This exists so `maybe_prompt` can tell the two reasons a toast window
    /// might be gone apart. Before it, a pending prompt whose window had
    /// closed was never re-shown — `maybe_prompt` returns early for as long
    /// as the program keeps running — so a toast lost to anything other than
    /// being answered (the ×, or the window closing on a `status-changed`
    /// race just as a new prompt was raised) left the question alive but
    /// completely invisible, with no toast ever appearing again. Only a real
    /// × belongs here; anything else gets the toast put back.
    pub toast_dismissed: HashSet<String>,
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

/// Shared by every identify path's `"untracked"` arm, since all three land
/// in the exact same server-side logic and so see the exact same response
/// shape. Surfaces the replay/resume prompt when the match is Completed or
/// DNF; does nothing (so the caller falls back to its own "remember, don't
/// ask again this cycle" bookkeeping) for Backlog, where there's nothing
/// to resume.
///
/// Returns true when a prompt was shown — the caller treats that exactly
/// like a successful identification for this tick, so the ordinary
/// "is this a game?" toast doesn't also fire for the same program.
fn maybe_prompt_resume(app: &AppHandle, response: &api::IdentifyResponse, exe_name: &str) -> bool {
    let Some(kind) = response.resumable.as_deref() else { return false };
    let Some(game_id) = response.game_id.clone() else { return false };
    let title = response.title.clone().unwrap_or_else(|| exe_name.to_string());
    log::info!(
        "\"{title}\" is {kind}; asking whether to {}",
        match kind {
            "dnf" => "resume",
            "backlog" => "start tracking",
            _ => "replay",
        },
    );
    app.state::<Tracker>().shared.lock().unwrap().pending_resume_prompt = Some(PendingResumePrompt {
        exe_name: exe_name.to_string(),
        game_id,
        title: title.clone(),
        kind: kind.to_string(),
    });
    toast::show(app, &title);
    true
}

/// Shows the platform-confirm prompt again for a game that's running and
/// still listed in `config::load_unconfirmed_platforms` — the "reappears
/// when the game is open again" half of the prompt's lifecycle (the other
/// half, clearing it when the game closes, is `clear_platform_prompt_for`
/// below). A no-op once the game isn't in that list any more (answered via
/// `set_platform`) or the prompt is already showing for this exact game.
fn maybe_reinstate_platform_prompt(app: &AppHandle, dir: &Path, game: &PlayingGame) {
    if !config::load_unconfirmed_platforms(dir).contains(&game.id) {
        return;
    }
    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    if shared.pending_platform_prompt.as_ref().is_some_and(|p| p.game_id == game.id) {
        return;
    }
    shared.pending_platform_prompt = Some(PendingPlatformPrompt {
        game_id: game.id.clone(),
        title: game.title.clone(),
        current_platform: game.platform.clone().unwrap_or_else(|| "PC (Windows)".into()),
    });
    drop(shared);
    ping_ui(app);
}

/// The "disappears when the game closes" half — called whenever tracking for
/// a game stops, so an unanswered prompt doesn't keep showing on the status
/// screen once there's nothing running for it to be about. The game stays in
/// `unconfirmed-platforms.json` regardless, so the prompt comes right back
/// the next time it's launched, until `set_platform` actually answers it.
fn clear_platform_prompt_for(app: &AppHandle, game_id: &str) {
    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    if shared.pending_platform_prompt.as_ref().is_some_and(|p| p.game_id == game_id) {
        shared.pending_platform_prompt = None;
        drop(shared);
        ping_ui(app);
    }
}

pub async fn run_loop(app: AppHandle) {
    // A short first delay so the window is up before anything pops.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let mut system = detect::new_system();
    // Remembers which processes have been judged, so polling every ten
    // seconds does not re-walk the same programs' modules forever.
    let mut judge = detect::GameJudge::default();
    let mut state_fetched: Option<Instant> = None;
    // At startup, then daily (hourly after a failure).
    let mut list_check_due = Instant::now();

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
                    // A fresh read of the world is exactly the signal that
                    // anything "already settled" needs re-checking — see
                    // the doc comment on `identified` for why this can't be
                    // held for the rest of the process.
                    shared.identified.clear();
                    shared.identified_titles.clear();
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

        if Instant::now() >= list_check_due {
            list_check_due = refresh_master_list(&app, &base, &token).await;
        }

        // ── What is running? ────────────────────────────────────────────────
        let mut candidates = detect::candidates(&mut system);
        // Programs the user has said to never auto-track. Filtered here,
        // before anything else sees them, so an ignored exe is fully inert:
        // never judged, never identified, never prompted about — this is
        // what makes "ignore" actually stop something already (wrongly)
        // being tracked, not just stop the question about it.
        {
            let shared = tracker.shared.lock().unwrap();
            if let Some(state) = &shared.state {
                if !state.ignored_executables.is_empty() {
                    candidates.retain(|c| !state.ignored_executables.contains(&c.exe_name));
                }
            }
        }
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

        // TEMP DIAG: one line per tick when wow.exe is seen running.
        if let Some(c) = candidates.iter().find(|c| c.exe_name == "wow.exe") {
            let shared = tracker.shared.lock().unwrap();
            log::info!(
                "DIAG wow pid={} run={}s path={:?} plausible={} judged={} pending={:?} dismissed={} toast_up={} session={:?}",
                c.pid,
                c.run_time_secs,
                c.path,
                detect::plausible_candidate(c),
                judge.judge(c),
                shared.pending_prompt.as_ref().map(|p| &p.exe_name),
                shared.toast_dismissed.contains("wow.exe"),
                app.get_webview_window(toast::LABEL).is_some(),
                current_game_id,
            );
        }


        match (&matched, &current_game_id) {
            (Some((game, _, _)), Some(current)) if &game.id == current => {
                maybe_reinstate_platform_prompt(&app, &tracker.data_dir, game);
            }
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
                maybe_reinstate_platform_prompt(&app, &tracker.data_dir, game);
                ping_ui(&app);
            }
            (None, Some(current)) => {
                clear_platform_prompt_for(&app, current);
                stop_session(&app, &base, &token).await;
            }
            (None, None) => {
                // The master list first: a local match on the program's own
                // path, which is itself the proof it's a game, and resolves
                // exactly for nearly every hit (admin igdb_id, or a Steam id).
                // Then the per-launcher fallbacks, which read real install
                // records: Steam's folder manifest, Epic's manifests, EA's
                // installerdata.xml. Only when all of these come to nothing
                // is the user asked anything — and a title guessed from the
                // exe name only ever *suggests* (the toast's search box),
                // never files a game on its own (tracker review T-H1).
                // TEMP DIAG: time each step
                let t0 = std::time::Instant::now();
                let m = identify_master_list(&app, &base, &token, &candidates).await;
                log::info!("DIAG CHAIN master={m} elapsed={:?}", t0.elapsed());
                let t1 = std::time::Instant::now();
                let s = !m && identify_steam_games(&app, &base, &token, &candidates, &mut judge).await;
                log::info!("DIAG CHAIN steam={s} elapsed={:?}", t1.elapsed());
                let t2 = std::time::Instant::now();
                let e = !m && !s && identify_other_launchers(&app, &base, &token, &candidates, &mut judge).await;
                log::info!("DIAG CHAIN epic={e} elapsed={:?}", t2.elapsed());
                let t3 = std::time::Instant::now();
                let ea = !m && !s && !e && identify_ea_games(&app, &base, &token, &candidates, &mut judge).await;
                log::info!("DIAG CHAIN ea={ea} elapsed={:?}", t3.elapsed());
                let identified = m || s || e || ea;
                if identified {
                    // Something was filed; re-read so the next tick can track
                    // it rather than waiting out the state cache.
                    tracker.shared.lock().unwrap().force_refresh = true;
                } else {
                    maybe_prompt(&app, &candidates, &playing, &executables, &mut judge);
                }
            }
        }

        // TEMP DIAG: pending state at end of tick
        {
            let shared = tracker.shared.lock().unwrap();
            log::info!(
                "DIAG END-OF-TICK pending={:?} toast_up={}",
                shared.pending_prompt.as_ref().map(|p| &p.exe_name),
                app.get_webview_window(toast::LABEL).is_some(),
            );
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
        if !judge.judge(candidate) || backing_off(app, &candidate.exe_name) {
            continue;
        }

        let suffix = master_list::path_suffix(path);
        let response = match api::post_identify(
            base, token, api::IdentifyBy::SteamAppId(app_id), &candidate.exe_name, "Steam", suffix.as_deref(),
        ).await {
            Ok(r) => r,
            Err(err) => {
                // Offline, or the site is down. Decide nothing and try again
                // in a while.
                log::warn!("could not identify steam app {app_id}: {err}");
                back_off(app, &candidate.exe_name);
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
                if let Some(game_id) = response.game_id.clone() {
                    config::add_unconfirmed_platform(&dir, &game_id);
                    tracker.shared.lock().unwrap().pending_platform_prompt =
                        Some(PendingPlatformPrompt { game_id, title: title.clone(), current_platform: "Steam".into() });
                    toast::show(app, &title);
                }
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
                // Backlog is genuinely the user's call, so say nothing and
                // remember not to ask again until the next state refresh.
                // Completed/DNF get a prompt instead (`resumable`) — those
                // are "already played before", worth asking about.
                if maybe_prompt_resume(app, &response, &candidate.exe_name) {
                    return true;
                }
                log::info!(
                    "steam app {app_id} is owned but {}; leaving it alone",
                    response.status.as_deref().unwrap_or("not trackable"),
                );
                tracker.shared.lock().unwrap().identified.insert(app_id);
            }
            // "unknown", or anything a newer site version returns: decide
            // nothing, and leave it to be retried in a while.
            _ => back_off(app, &candidate.exe_name),
        }
    }
    false
}

/// The master list (`master_list.rs`): the program's own path matched against
/// a known path ending, on this PC. Only a hit is sent to the site.
///
/// Gated by [`detect::plausible_candidate`] — a visible window, running at
/// least 20 seconds, not everyday software or an installer — and **not** by
/// the full `GameJudge`: being on the list is already the proof it's a game,
/// and the judge's graphics-module probe can be defeated by anti-cheat
/// (confirmed live against Dead by Daylight, whose path and modules are both
/// unreadable). Without a readable path only bare-name entries can match.
async fn identify_master_list(
    app: &AppHandle,
    base: &str,
    token: &str,
    candidates: &[detect::Candidate],
) -> bool {
    let tracker = app.state::<Tracker>();
    let Some(list) = tracker.shared.lock().unwrap().master_list.clone() else { return false };
    let dir = tracker.data_dir.clone();
    let asked = config::load_asked(&dir);

    for candidate in candidates {
        if asked.contains(&candidate.exe_name) || !detect::plausible_candidate(candidate) {
            continue;
        }
        let Some(hit) = list.find(candidate.path.as_deref(), &candidate.exe_name) else { continue };
        if tracker.shared.lock().unwrap().identified_titles.contains(&candidate.exe_name)
            || backing_off(app, &candidate.exe_name)
        {
            continue;
        }

        let platform = master_list::platform_for_path(candidate.path.as_deref());
        let suffix = candidate.path.as_deref().and_then(master_list::path_suffix);
        let response = match api::post_identify(
            base, token, api::IdentifyBy::Detectable(hit.id), &candidate.exe_name, platform, suffix.as_deref(),
        ).await {
            Ok(r) => r,
            Err(err) => {
                log::warn!("could not identify \"{}\" (master list {}): {err}", candidate.exe_name, hit.suffix);
                back_off(app, &candidate.exe_name);
                continue;
            }
        };

        match response.result.as_str() {
            "added" => {
                let title = response.title.unwrap_or_else(|| candidate.exe_name.clone());
                log::info!("added {title} as an ambient game (master list: \"{}\")", hit.suffix);
                // As with the other paths: the link this created is what
                // keeps it from being re-asked, so nothing is remembered here.
                if let Some(game_id) = response.game_id.clone() {
                    config::add_unconfirmed_platform(&dir, &game_id);
                    tracker.shared.lock().unwrap().pending_platform_prompt =
                        Some(PendingPlatformPrompt { game_id, title: title.clone(), current_platform: platform.into() });
                    toast::show(app, &title);
                }
                notify(app, "Now tracking", &format!("{title} — added to your Ambient games."));
                return true;
            }
            "tracked" => return true,
            "untracked" => {
                if maybe_prompt_resume(app, &response, &candidate.exe_name) {
                    return true;
                }
                log::info!(
                    "\"{}\" is owned but {}; leaving it alone",
                    candidate.exe_name,
                    response.status.as_deref().unwrap_or("not trackable"),
                );
                tracker.shared.lock().unwrap().identified_titles.insert(candidate.exe_name.clone());
            }
            // "unknown": on the list, but nothing on IGDB matched it. Not a
            // "not a game" — try again in a while, and meanwhile let the
            // later steps and the ordinary toast have their go.
            _ => back_off(app, &candidate.exe_name),
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

        if !judge.judge(candidate) || backing_off(app, &candidate.exe_name) {
            continue;
        }

        let suffix = master_list::path_suffix(path);
        let response = match api::post_identify(
            base, token, api::IdentifyBy::Title(&title), &candidate.exe_name, platform, suffix.as_deref(),
        ).await {
            Ok(r) => r,
            Err(err) => {
                log::warn!("could not identify \"{title}\": {err}");
                back_off(app, &candidate.exe_name);
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
                if let Some(game_id) = response.game_id.clone() {
                    config::add_unconfirmed_platform(&dir, &game_id);
                    tracker.shared.lock().unwrap().pending_platform_prompt =
                        Some(PendingPlatformPrompt { game_id, title: shown.clone(), current_platform: platform.to_string() });
                    toast::show(app, &shown);
                }
                notify(app, "Now tracking", &format!("{shown} — added to your Ambient games."));
                return true;
            }
            "tracked" => {
                return true;
            }
            "untracked" => {
                if maybe_prompt_resume(app, &response, &candidate.exe_name) {
                    return true;
                }
                // Worth remembering: no link exists, and nothing changes here
                // without the user acting on the site.
                log::info!(
                    "\"{title}\" is owned but {}; leaving it alone",
                    response.status.as_deref().unwrap_or("not trackable"),
                );
                tracker.shared.lock().unwrap().identified_titles.insert(candidate.exe_name.clone());
            }
            // "unknown" (no exact IGDB match): decide nothing, ask again in
            // a while, and let the heuristic prompt offer the usual "is this
            // a game?" toast meanwhile.
            _ => back_off(app, &candidate.exe_name),
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
    executables: &HashMap<String, String>,
    judge: &mut detect::GameJudge,
) {
    let tracker = app.state::<Tracker>();
    {
        let mut shared = tracker.shared.lock().unwrap();
        if let Some(prompt) = &shared.pending_prompt {
            // Still up — stay quiet rather than asking about something else
            // while an answerable question is sitting on the status screen.
            if candidates.iter().any(|c| c.exe_name == prompt.exe_name) {
                // ...but if the toast window is gone and the user never
                // actually dismissed it, the question is only on the status
                // screen, where nobody is looking mid-game. Put it back.
                let exe_name = prompt.exe_name.clone();
                let dismissed = shared.toast_dismissed.contains(&exe_name);
                drop(shared);
                if !dismissed && app.get_webview_window(toast::LABEL).is_none() {
                    log::info!("re-showing the lost toast for {exe_name}");
                    toast::show(app, &exe_name);
                }
                return;
            }
            // The program the prompt was about has closed, so the question no
            // longer applies. Without this, closing the toast's × (which
            // deliberately leaves `pending_prompt` set, so an accidental close
            // doesn't lose the question) and then launching something
            // completely different silently asked about nothing at all —
            // indistinguishable from the app simply being broken.
            log::info!("DIAG CLEAR path=no_longer_running exe={}", prompt.exe_name);
            log::info!("{} is no longer running; dropping its unanswered prompt", prompt.exe_name);
            shared.pending_prompt = None;
            drop(shared);
            let _ = app.emit("status-changed", ());
        }
    }

    // `g.linked` also counts a `steam_appid` on the game row, which only
    // means something while *that* game is the one Steam reports running.
    // A game owned on Steam but currently being played through a different
    // client (confirmed live: Overwatch, played via Battle.net) has no
    // Steam app id to match this tick and no executable link either — but
    // `g.linked` still said yes, so this gate silently never asked. Only an
    // executable link actually rules a game out of needing to be asked
    // about: by the time this runs, the Steam app id check two steps up in
    // `run_loop` has already had its chance this tick and come up empty.
    let has_exe_link = |game_id: &str| executables.values().any(|id| id == game_id);

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
        let unlinked: Vec<&PlayingGame> = playing.iter().filter(|g| !has_exe_link(&g.id)).collect();
        let matched = matching::best_title(
            &candidate.exe_name,
            unlinked.iter().map(|g| g.title.as_str()),
        )
        .filter(|(_, points)| *points >= matching::CONFIDENT)
        .and_then(|(title, _)| unlinked.iter().find(|g| g.title == title))
        .copied();

        // Nothing resembled it — including, now, an empty library with
        // nothing to resemble at all — but the gates have already said it
        // looks like a game, so it is still worth one question. `suggestion`
        // being absent only ever reaches the unconfident toast, which never
        // reads these fields: "Pick it" opens the search panel for the exe
        // directly rather than naming a game at random.
        let confident = matched.is_some();
        let suggestion = matched.or_else(|| unlinked.first().copied());

        // Deliberately not recorded as asked here. Posing a question is not
        // the same as having it answered: a toast nobody saw, or one lost to
        // the app restarting, used to mean that program was never offered
        // again. It is written when someone actually answers.
        let prompt = PendingPrompt {
            exe_name: candidate.exe_name.clone(),
            suggested_game_id: suggestion.map(|g| g.id.clone()).unwrap_or_default(),
            suggested_title: suggestion.map(|g| g.title.clone()).unwrap_or_default(),
            confident,
        };
        tracker.shared.lock().unwrap().pending_prompt = Some(prompt.clone());
        // Asked in the corner of the screen, with the buttons on it. The
        // status screen keeps the same question, for anyone who misses it.
        toast::show(app, &prompt.exe_name);
        ping_ui(app);
        return;
    }
}
