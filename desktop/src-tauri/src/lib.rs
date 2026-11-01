//! GamesList desktop.
//!
//! Native where it has to be — process watching, tray, notifications — and the
//! website everywhere else, so there is only ever one copy of the UI.

mod api;
mod battlenet;
mod config;
mod detect;
mod matching;
mod ea;
mod launchers;
mod pairing;
mod steam;
mod toast;
mod tracker;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tracker::{PendingPrompt, Tracker};

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
    api_base: String,
    pending_update: Option<UpdateInfo>,
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
        api_base: config.base(),
        pending_update,
    }
}

#[tauri::command]
fn start_pairing(app: AppHandle) -> Result<(), String> {
    pairing::start(app)
}

/// "Yes, that is the game" — link the executable and clear the prompt.
#[tauri::command]
async fn confirm_prompt(app: AppHandle) -> Result<(), String> {
    let (base, token, prompt) = {
        let tracker = app.state::<Tracker>();
        let config = tracker.snapshot_config();
        let prompt = tracker.shared.lock().unwrap().pending_prompt.clone();
        (config.base(), config.token.unwrap_or_default(), prompt)
    };
    let Some(prompt) = prompt else { return Ok(()) };

    if let Err(err) = api::post_link(&base, &token, &prompt.exe_name, &prompt.suggested_game_id).await
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

/// Ask the watcher to re-read the server on its next tick.
///
/// Linking a game happens on the website, in a different window, so the app
/// has no way to know it happened. The UI calls this whenever it comes back
/// into focus.
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
#[tauri::command]
async fn link_executable(app: AppHandle, exe_name: String, game_id: String) -> Result<(), String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    api::post_link(&base, &token, &exe_name, &game_id).await?;
    app.state::<Tracker>().shared.lock().unwrap().force_refresh = true;
    Ok(())
}

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

/// Add a game the user picked themselves from a search result, optionally
/// linking it to the program that prompted the search.
#[tauri::command]
async fn add_searched_game(
    app: AppHandle,
    igdb_id: u32,
    title: String,
    exe_name: Option<String>,
) -> Result<api::IdentifyResponse, String> {
    let (base, token) = {
        let config = app.state::<Tracker>().snapshot_config();
        (config.base(), config.token.clone().unwrap_or_default())
    };
    let response = api::post_identify(
        &base,
        &token,
        api::IdentifyBy::IgdbId { id: igdb_id, title: &title },
        exe_name.as_deref().unwrap_or(""),
        "PC (Windows)",
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
/// abandoned link still gets another chance tomorrow.
#[tauri::command]
fn dismiss_prompt(app: AppHandle, remember: Option<bool>) {
    let tracker = app.state::<Tracker>();
    let dir = tracker.data_dir.clone();
    let prompt = {
        let mut shared = tracker.shared.lock().unwrap();
        let prompt = shared.pending_prompt.take();
        if let Some(prompt) = &prompt {
            shared.skip_for_now.insert(prompt.exe_name.clone());
        }
        prompt
    };

    if let Some(prompt) = &prompt
        && remember.unwrap_or(false)
    {
        log::info!("{} is not a game; not asking again", prompt.exe_name);
        config::add_asked(&dir, &prompt.exe_name);
    }
    // As in `confirm_prompt`: whichever window answered, the other one is
    // still showing the question.
    let _ = app.emit("status-changed", ());
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

            // ── Tray ────────────────────────────────────────────────────────
            let open = MenuItem::with_id(app, "open", "Open GamesList", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GamesList")
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
                    toast::show(&handle, &prompt);
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
