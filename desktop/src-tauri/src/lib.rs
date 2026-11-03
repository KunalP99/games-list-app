//! GamesList desktop.
//!
//! Native where it has to be — process watching, tray, notifications — and the
//! website everywhere else, so there is only ever one copy of the UI.

mod api;
mod config;
mod detect;
mod matching;
mod ea;
mod launchers;
mod master_list;
mod pairing;
mod steam;
mod toast;
mod tracker;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tracker::{PendingPlatformPrompt, PendingPrompt, PendingResumePrompt, Tracker};

/// A version seen once at launch, waiting on the main window's modal to ask
/// about it. Holds the real `Update` handle, not just its version string —
/// `install_update` needs the signature/download URL that came with it, and
/// there is no cheap way to get that back from a bare version number.
#[derive(Default)]
struct UpdateState(std::sync::Mutex<Option<tauri_plugin_updater::Update>>);

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

#[derive(Serialize)]
pub struct TrackingView {
    title: String,
    minutes: u64,
    /// When the session began, so the window can tick its own clock
    /// rather than waiting for the next status read — and so reopening
    /// the window shows the real elapsed time instead of restarting.
    started_at: String,
}

#[derive(Serialize)]
pub struct StatusView {
    paired: bool,
    display_name: Option<String>,
    theme: String,
    palette: std::collections::HashMap<String, [u8; 3]>,
    tracking: Option<TrackingView>,
    playing: Vec<api::PlayingGame>,
    last_sync: Option<String>,
    queued: usize,
    last_error: Option<String>,
    pending_prompt: Option<PendingPrompt>,
    pending_platform_prompt: Option<PendingPlatformPrompt>,
    pending_resume_prompt: Option<PendingResumePrompt>,
    api_base: String,
    pending_update: Option<UpdateInfo>,
    /// True only in a debug build — never in the installed app, which is
    /// release-only. Drives the "DEV" badge, so there's no way to confuse a
    /// `npm run dev`/`npm run restart` window for the real one. (They no
    /// longer share anything: both scripts merge in `tauri.dev.conf.json`,
    /// giving dev builds their own identifier, settings folder and
    /// single-instance lock, so the two can run side by side.)
    is_dev: bool,
}

/// Everything the status screen needs, in one call.
#[tauri::command]
fn get_status(app: AppHandle) -> StatusView {
    let tracker = app.state::<Tracker>();
    let config = tracker.snapshot_config();
    let shared = tracker.shared.lock().unwrap();
    log::debug!("get_status: paired={} tracking={}", config.is_paired(), shared.session.is_some());

    let pending_update = app
        .state::<UpdateState>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|update| UpdateInfo { version: update.version.clone(), notes: update.body.clone() });

    StatusView {
        paired: config.is_paired(),
        display_name: shared.state.as_ref().and_then(|s| s.display_name.clone()),
        theme: shared.state.as_ref().map(|s| s.theme.clone()).unwrap_or_else(|| "system".into()),
        palette: shared.state.as_ref().map(|s| s.palette.clone()).unwrap_or_default(),
        tracking: shared
            .session
            .as_ref()
            .map(|s| TrackingView {
                title: s.title.clone(),
                minutes: s.minutes(),
                started_at: s.started_at.to_rfc3339(),
            }),
        playing: shared.state.as_ref().map(|s| s.playing.clone()).unwrap_or_default(),
        last_sync: shared.last_sync.map(|t| t.to_rfc3339()),
        queued: shared.queued,
        last_error: shared.last_error.clone(),
        pending_prompt: shared.pending_prompt.clone(),
        pending_platform_prompt: shared.pending_platform_prompt.clone(),
        pending_resume_prompt: shared.pending_resume_prompt.clone(),
        api_base: config.base(),
        pending_update,
        is_dev: cfg!(debug_assertions),
    }
}

#[tauri::command]
fn start_pairing(app: AppHandle) -> Result<(), String> {
    pairing::start(app)
}

/// "Yes, that is the game" — link the executable and clear the prompt.
#[tauri::command]
async fn confirm_prompt(app: AppHandle) -> Result<(), String> {
    // TEMP DIAG
    log::info!("DIAG confirm_prompt entered");
    let (base, token, prompt) = {
        let tracker = app.state::<Tracker>();
        let config = tracker.snapshot_config();
        let prompt = tracker.shared.lock().unwrap().pending_prompt.clone();
        (config.base(), config.token.unwrap_or_default(), prompt)
    };
    let Some(prompt) = prompt else { return Ok(()) };

    let suffix = running_path_suffix(&prompt.exe_name);
    if let Err(err) =
        api::post_link(&base, &token, &prompt.exe_name, &prompt.suggested_game_id, suffix.as_deref()).await
    {
        // Worth a line of its own: the prompt stays pending, so without this
        // the only trace of a failed link is the user saying it did nothing.
        log::warn!("could not link {}: {err}", prompt.exe_name);
        return Err(err);
    }
    log::info!("linked {} to {}", prompt.exe_name, prompt.suggested_title);

    {
        let tracker = app.state::<Tracker>();
        let mut shared = tracker.shared.lock().unwrap();
        log::info!("DIAG CLEAR path=confirm_prompt exe={}", prompt.exe_name);
        shared.pending_prompt = None;
        shared.skip_for_now.insert(prompt.exe_name.clone());
        // Re-read so the new link is picked up on the next tick.
        shared.force_refresh = true;
    }
    // The same question is on the status screen, and it may not be the window
    // that just answered it — the toast is usually the one in front.
    let _ = app.emit("status-changed", ());
    Ok(())
}

/// The path ending (`tunic/tunic.exe`) of a running program, for the site's
/// master-list admin queue — see `master_list::path_suffix`. None when it
/// isn't running or its path can't be read; the link still goes ahead.
fn running_path_suffix(exe_name: &str) -> Option<String> {
    let mut system = detect::new_system();
    detect::candidates(&mut system)
        .into_iter()
        .find(|c| c.exe_name == exe_name && c.path.is_some())
        .and_then(|c| master_list::path_suffix(c.path.as_deref()?))
}

/// Programs currently running that the user might want to link.
///
/// Offered instead of making them type an executable name: the app already
/// knows what is running, and a list is both quicker and impossible to
/// mistype.
#[tauri::command]
fn running_programs() -> Vec<String> {
    let mut system = detect::new_system();
    let mut names: Vec<String> = detect::candidates(&mut system)
        .into_iter()
        .filter(detect::pickable)
        .map(|c| c.exe_name)
        .collect();
    names.sort();
    names.dedup();
    names
}

/// Forget a link, from inside the app.
///
/// Without this, linking the wrong program — a browser, say — keeps logging
/// it as play time with no way to stop short of editing the database. That is
/// not a hypothetical: it happened during testing.
#[tauri::command]
async fn unlink_executable(app: AppHandle, exe_name: String) -> Result<(), String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    api::post_unlink(&base, &token, &exe_name).await?;

    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    shared.force_refresh = true;
    // Stop timing it immediately; otherwise the session keeps running against
    // a game the user has just said this program is not.
    if shared.session.as_ref().and_then(|s| s.exe_name.clone()).as_deref() == Some(exe_name.as_str()) {
        shared.session = None;
    }
    Ok(())
}

/// The running program most likely to be this game.
///
/// So picking "Vampire Survivors" in the link panel selects
/// vampiresurvivors.exe rather than leaving the user to find it among
/// everything else that happens to be running.
#[tauri::command]
fn suggest_program(title: String) -> Option<String> {
    let mut system = detect::new_system();
    let running: Vec<String> = detect::candidates(&mut system)
        .into_iter()
        .filter(detect::pickable)
        .map(|c| c.exe_name)
        .collect();

    matching::best_exe(&title, running.iter().map(|s| s.as_str()))
        // Below this it is a guess, and a wrong preselection is worse than
        // none: the user would have to notice it before correcting it.
        .filter(|(_, points)| *points >= matching::CONFIDENT)
        .map(|(exe, _)| exe.to_string())
}

/// Link an executable to a game, from inside the app.
///
/// The website has a page for this too, but doing it here means no second
/// window, no webview session to expire, and nothing to go blank.
///
/// `platform`, if given, is only sent on when it differs from what the game
/// already has — the link panel's dropdown always has *some* value selected,
/// and resending the same one on every link would be pointless traffic, not
/// a correction.
#[tauri::command]
async fn link_executable(
    app: AppHandle,
    exe_name: String,
    game_id: String,
    platform: Option<String>,
    current_platform: Option<String>,
) -> Result<(), String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    let suffix = running_path_suffix(&exe_name);
    api::post_link(&base, &token, &exe_name, &game_id, suffix.as_deref()).await?;
    if let Some(platform) = platform {
        if current_platform.as_deref() != Some(platform.as_str()) {
            api::post_platform(&base, &token, &game_id, &platform).await?;
        }
    }
    app.state::<Tracker>().shared.lock().unwrap().force_refresh = true;
    Ok(())
}

/// Ask the watcher to re-read the server on its next tick.
///
/// Linking a game happens on the website, in a different window, so the app
/// has no way to know it happened. The UI calls this whenever it comes back
/// into focus.
#[tauri::command]
fn refresh_state(app: AppHandle) {
    app.state::<Tracker>().shared.lock().unwrap().force_refresh = true;
}

/// Search for a game by text, for the search panel's "can't find it? add it
/// as a new game" flow.
#[tauri::command]
async fn search_games(app: AppHandle, query: String) -> Result<Vec<api::SearchResult>, String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    api::search_games(&base, &token, &query).await
}

/// Add a game the user picked themselves from a search result.
///
/// Deliberately never links it to a program itself, even when the search
/// was opened for a specific one: doing that silently here meant "Add it as
/// a new game" could finish with nothing visibly happening and no link
/// actually made (an empty program selection sends an empty exe name, which
/// the server correctly refuses to link — so tracking never started and
/// there was no sign why). The caller reopens the link panel with this game
/// preselected instead, so "Link them" is the one, explicit, always-visible
/// step that actually starts tracking.
#[tauri::command]
async fn add_searched_game(
    app: AppHandle,
    igdb_id: u32,
    title: String,
) -> Result<api::IdentifyResponse, String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    let response = api::post_identify(
        &base,
        &token,
        api::IdentifyBy::IgdbId { id: igdb_id, title: &title },
        "",
        "PC (Windows)",
        None,
    )
    .await?;
    app.state::<Tracker>().shared.lock().unwrap().force_refresh = true;
    Ok(response)
}

/// List every PC paired to this account, for the native Devices panel.
#[tauri::command]
async fn list_devices(app: AppHandle) -> Result<Vec<api::DeviceInfo>, String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    api::list_devices(&base, &token).await
}

/// Issue a token for pairing a different PC, from this one's Devices panel.
#[tauri::command]
async fn create_device_token(app: AppHandle, label: String) -> Result<String, String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    api::create_device_token(&base, &token, &label).await
}

/// Revoke a paired PC from the native Devices panel.
#[tauri::command]
async fn revoke_device(app: AppHandle, device_id: String) -> Result<(), String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    api::revoke_device(&base, &token, &device_id).await
}

/// Download, verify and install the update the main window's modal is
/// showing, then relaunch.
///
/// Takes the stored `Update` rather than re-checking: it carries the exact
/// signature and download URL that `check()` already resolved, which is
/// also why this errors outright if nothing is pending — there is no
/// version string here to re-resolve from. On a successful Windows install
/// the installer takes over and this process exits before ever returning,
/// so an `Ok(())` reaching the frontend is not the expected case there.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app.state::<UpdateState>().0.lock().unwrap().take();
    let Some(update) = update else { return Err("no update is pending".into()) };
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())
}

/// Clear the prompt.
///
/// `remember` is the difference between "not a game" and "not now". Only an
/// outright no is written to `asked.json`, which is permanent; sending the
/// question to the link panel merely stops it coming back this run, so an
/// abandoned link still gets another chance tomorrow. An outright no is also
/// told to the server (`ignored_executables`), so it shows up and is
/// reversible from Settings rather than living only in this machine's local
/// file — best-effort: a failure here still leaves `asked.json` doing its job
/// locally.
#[tauri::command]
async fn dismiss_prompt(app: AppHandle, remember: Option<bool>) {
    // TEMP DIAG
    log::info!("DIAG dismiss_prompt entered remember={remember:?}");
    let tracker = app.state::<Tracker>();
    let dir = tracker.data_dir.clone();
    let (base, token) = {
        let config = tracker.snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    let prompt = {
        let mut shared = tracker.shared.lock().unwrap();
        let prompt = shared.pending_prompt.take();
        if let Some(prompt) = &prompt {
            log::info!("DIAG CLEAR path=dismiss_prompt exe={} remember={remember:?}", prompt.exe_name);
            shared.skip_for_now.insert(prompt.exe_name.clone());
        }
        prompt
    };

    if let Some(prompt) = &prompt
        && remember.unwrap_or(false)
    {
        log::info!("{} is not a game; not asking again", prompt.exe_name);
        config::add_asked(&dir, &prompt.exe_name);
        match api::post_ignore(&base, &token, &prompt.exe_name).await {
            Ok(()) => tracker.shared.lock().unwrap().force_refresh = true,
            Err(err) => log::warn!("could not record ignore for {}: {err}", prompt.exe_name),
        }
    }
    // As in `confirm_prompt`: whichever window answered, the other one is
    // still showing the question.
    let _ = app.emit("status-changed", ());
}

/// Record that the user closed the toast window with its × — without
/// answering anything.
///
/// The question deliberately stays pending (closing the × is not an answer,
/// and may well be a misclick), so this only says "don't put this particular
/// toast back up". That distinction is the whole point: without it, a
/// pending question whose window had gone was indistinguishable from one the
/// user had waved away, so `maybe_prompt` never re-showed either — and a
/// toast lost to anything but the × silently never came back.
#[tauri::command]
fn dismiss_toast(app: AppHandle) {
    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    if let Some(prompt) = &shared.pending_prompt {
        let exe_name = prompt.exe_name.clone();
        shared.toast_dismissed.insert(exe_name);
    }
}

/// Save the platform the platform-confirm prompt is showing, and clear it.
///
/// Takes the stored prompt's `game_id` rather than one passed in from the
/// frontend: the prompt already names exactly which game this is about, and
/// trusting the caller for that would let a stale or mistimed call touch the
/// wrong game.
#[tauri::command]
async fn set_platform(app: AppHandle, platform: String) -> Result<(), String> {
    let (base, token, prompt) = {
        let tracker = app.state::<Tracker>();
        let config = tracker.snapshot_config();
        let prompt = tracker.shared.lock().unwrap().pending_platform_prompt.clone();
        (config.base(), config.token.unwrap_or_default(), prompt)
    };
    let Some(prompt) = prompt else { return Ok(()) };

    api::post_platform(&base, &token, &prompt.game_id, &platform).await?;

    let tracker = app.state::<Tracker>();
    config::remove_unconfirmed_platform(&tracker.data_dir, &prompt.game_id);
    tracker.shared.lock().unwrap().pending_platform_prompt = None;
    let _ = app.emit("status-changed", ());
    Ok(())
}

/// Answer the "is this a replay?" / "are you resuming?" / "set to Playing or
/// Ambient?" prompt.
///
/// `status` is the target chosen for the backlog case specifically — the
/// other two kinds have exactly one possible outcome, so the frontend never
/// sends it for those, and the server never asks for it either.
///
/// `accept: false` is deliberately not written anywhere permanent — unlike
/// "not a game", declining says nothing about whether the program is a
/// game (it plainly is, already in the library), only that today isn't the
/// day for this. `skip_for_now` just quiets this run; a fresh launch asks
/// again.
#[tauri::command]
async fn respond_to_resume_prompt(app: AppHandle, accept: bool, status: Option<String>) -> Result<(), String> {
    let tracker = app.state::<Tracker>();
    let prompt = tracker.shared.lock().unwrap().pending_resume_prompt.clone();
    let Some(prompt) = prompt else { return Ok(()) };

    if !accept {
        let mut shared = tracker.shared.lock().unwrap();
        shared.pending_resume_prompt = None;
        shared.skip_for_now.insert(prompt.exe_name.clone());
        drop(shared);
        let _ = app.emit("status-changed", ());
        return Ok(());
    }

    let (base, token) = {
        let config = tracker.snapshot_config();
        (config.base(), config.token.unwrap_or_default())
    };
    let response = api::post_resume(&base, &token, &prompt.game_id, &prompt.kind, status.as_deref(), &prompt.exe_name).await?;
    log::info!(
        "{} {} ({})",
        match prompt.kind.as_str() {
            "dnf" => "resumed",
            "backlog" => "started tracking",
            _ => "replaying",
        },
        response.title,
        response.game_id,
    );

    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    shared.pending_resume_prompt = None;
    shared.force_refresh = true;
    drop(shared);
    let _ = app.emit("status-changed", ());
    Ok(())
}

/// The toast has painted: show the window it was built hidden in.
///
/// Built hidden and revealed from here so a half-loaded page can never appear
/// as a white box in the corner of someone's game.
#[tauri::command]
fn toast_ready(app: AppHandle) {
    if let Some(window) = app.get_webview_window(toast::LABEL) {
        let _ = window.show();
        toast::force_to_front(&window);
    }
}

/// Take the toast down. Called by the toast itself once it is answered.
#[tauri::command]
fn close_toast(app: AppHandle) {
    toast::close(&app);
}

/// Bring the app's own window up, optionally straight onto the link panel.
///
/// `link_exe` is for the toast's "Pick it": it has a program and no idea which
/// game it is, which is exactly what the link panel is for.
#[tauri::command]
fn open_app(app: AppHandle, link_exe: Option<String>) {
    show_main(&app);
    if let Some(exe) = link_exe {
        let _ = app.emit("open-link-panel", exe);
    }
}

#[tauri::command]
fn sign_out(app: AppHandle) {
    let tracker = app.state::<Tracker>();
    {
        let mut config = tracker.config.lock().unwrap();
        config.token = None;
        // config.json is shared by every build on a machine — debug, release,
        // the installer — keyed by the app's identifier, not by which one
        // wrote it. A dev build pointed at the local stack with
        // `set_api_base` (never exposed in the UI; console-only, for
        // testing) leaves that setting behind for every other build on this
        // machine too, including a real install. Caught live: Connect opened
        // a blank window because it was trying to reach `localhost:3000`
        // with nothing listening there. Sign Out is the one place an actual
        // user can reach from inside the app, so it's also the place that
        // resets this back to production.
        config.api_base = config::DEFAULT_API_BASE.to_string();
        config::save(&tracker.data_dir, &config);
    }
    let mut shared = tracker.shared.lock().unwrap();
    shared.state = None;
    shared.session = None;
}

/// Lets a tester point the app at the local stack instead of production.
#[tauri::command]
fn set_api_base(app: AppHandle, base: String) {
    let tracker = app.state::<Tracker>();
    let mut config = tracker.config.lock().unwrap();
    config.api_base = base;
    // A token issued by one site is meaningless on another.
    config.token = None;
    config::save(&tracker.data_dir, &config);
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch should surface the running app, not start another.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimised"]),
        ))
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_pairing,
            confirm_prompt,
            dismiss_prompt,
            dismiss_toast,
            toast_ready,
            close_toast,
            open_app,
            refresh_state,
            running_programs,
            link_executable,
            suggest_program,
            unlink_executable,
            search_games,
            add_searched_game,
            list_devices,
            create_device_token,
            revoke_device,
            sign_out,
            set_api_base,
            install_update,
            set_platform,
            respond_to_resume_prompt,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            app.manage(Tracker::new(data_dir));
            app.manage(UpdateState::default());

            // Checked once per launch, never periodically — the main
            // window's modal (fed by `pending_update` on `get_status`) is the
            // only place this is ever asked about again. Not gated by
            // `cfg!(debug_assertions)` like autostart above: this is just a
            // read-only network check, harmless in dev, and running it on
            // every launch (including a silent `--minimised` one) means the
            // check has already happened by the time the user opens the main
            // window, autostarted or not.
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_updater::UpdaterExt;
                    let updater = match handle.updater() {
                        Ok(u) => u,
                        Err(err) => {
                            log::warn!("updater unavailable: {err}");
                            return;
                        }
                    };
                    match updater.check().await {
                        Ok(Some(update)) => {
                            log::info!("update available: {}", update.version);
                            *handle.state::<UpdateState>().0.lock().unwrap() = Some(update);
                            let _ = handle.emit("status-changed", ());
                        }
                        Ok(None) => {}
                        Err(err) => log::warn!("update check failed: {err}"),
                    }
                });
            }

            // Forced, not a setting: there is no toggle anywhere to turn this
            // off, by design — a background tracker is only useful if it is
            // actually running. Called unconditionally rather than guarded by
            // `is_enabled()` first: it just rewrites the same registry value,
            // so this is also how a key removed by hand (or by Windows) gets
            // quietly restored on the next launch. Skipped in debug builds —
            // otherwise every `cargo run`/`tauri dev` while developing this
            // would plant a real startup entry on this machine pointing at a
            // throwaway debug build.
            if !cfg!(debug_assertions) {
                use tauri_plugin_autostart::ManagerExt;
                if let Err(err) = app.autolaunch().enable() {
                    log::warn!("could not enable autostart: {err}");
                }
            }

            // A debug build and the installed release share the same app
            // identifier, so the single-instance guard below treats them as
            // one and the same — running this while the real app is already
            // up just refocuses *that* window instead of starting a new one.
            // The title and tray tooltip say so plainly, in case that
            // happens anyway; the in-window "DEV" badge (`get_status`'s
            // `is_dev`) is the same signal once the page itself has loaded.
            if cfg!(debug_assertions) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title("GamesList (DEV)");
                }
            }

            // ── Tray ────────────────────────────────────────────────────────
            let open = MenuItem::with_id(app, "open", "Open GamesList", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(if cfg!(debug_assertions) { "GamesList (DEV)" } else { "GamesList" })
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Started by the autostart entry: go straight to the tray.
            if std::env::args().any(|a| a == "--minimised") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Debug aids: drive the flows without a human clicking.
            //
            // `--toast[=unsure]` stands in for a real detection: reaching one
            // of those otherwise means pairing, a Playing game, and waiting
            // out the three-minute settle period, which is no way to check
            // where a window lands or what colour it is.
            if let Some(arg) = std::env::args().find(|a| a.starts_with("--toast")) {
                let prompt = PendingPrompt {
                    exe_name: "vampiresurvivors.exe".into(),
                    suggested_game_id: "debug".into(),
                    suggested_title: "Vampire Survivors".into(),
                    confident: !arg.ends_with("=unsure"),
                };
                let handle = app.handle().clone();
                handle.state::<Tracker>().shared.lock().unwrap().pending_prompt =
                    Some(prompt.clone());
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    toast::show(&handle, &prompt.exe_name);
                });
            }
            if std::env::args().any(|a| a == "--pair") {
                let handle = app.handle().clone();
                let _ = pairing::start(handle);
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tracker::run_loop(handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window leaves it watching in the tray, which is
            // what a background tool should do. Quit is on the tray menu.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running GamesList");
}
