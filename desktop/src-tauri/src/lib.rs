//! GamesList desktop.
//!
//! Native where it has to be — process watching, tray, notifications — and the
//! website everywhere else, so there is only ever one copy of the UI.

mod api;
mod config;
mod detect;
mod pairing;
mod tracker;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tracker::{PendingPrompt, Tracker};

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
}

/// Everything the status screen needs, in one call.
#[tauri::command]
fn get_status(app: AppHandle) -> StatusView {
    let tracker = app.state::<Tracker>();
    let config = tracker.snapshot_config();
    let shared = tracker.shared.lock().unwrap();
    log::debug!("get_status: paired={} tracking={}", config.is_paired(), shared.session.is_some());

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
    }
}

#[tauri::command]
fn start_pairing(app: AppHandle) -> Result<(), String> {
    pairing::start(app)
}

/// Open one of the website's own pages in an app window — this is how the app
/// gets the games list, settings and linking screens without rebuilding them.
#[tauri::command]
fn open_site(app: AppHandle, path: String) -> Result<(), String> {
    let base = app.state::<Tracker>().snapshot_config().base();
    let url = format!("{base}{path}");
    let parsed = url.parse().map_err(|_| "bad url".to_string())?;

    log::info!("opening site window at {url}");

    // Reuse the window if it is already open: closing and immediately
    // rebuilding with the same label races, and a label collision fails the
    // build outright.
    if let Some(existing) = app.get_webview_window("site") {
        existing.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "site", WebviewUrl::External(parsed))
        .title("GamesList")
        .inner_size(1000.0, 760.0)
        .center()
        .on_navigation(|target| {
            log::info!("site window navigating to {target}");
            true
        })
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
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

    api::post_link(&base, &token, &prompt.exe_name, &prompt.suggested_game_id).await?;

    let tracker = app.state::<Tracker>();
    let mut shared = tracker.shared.lock().unwrap();
    shared.pending_prompt = None;
    // Force the next loop to re-read the state so the new link is picked up.
    shared.state = None;
    Ok(())
}

#[tauri::command]
fn dismiss_prompt(app: AppHandle) {
    app.state::<Tracker>().shared.lock().unwrap().pending_prompt = None;
}

#[tauri::command]
fn sign_out(app: AppHandle) {
    let tracker = app.state::<Tracker>();
    {
        let mut config = tracker.config.lock().unwrap();
        config.token = None;
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
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_pairing,
            open_site,
            confirm_prompt,
            dismiss_prompt,
            sign_out,
            set_api_base,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            app.manage(Tracker::new(data_dir));

            // ── Tray ────────────────────────────────────────────────────────
            let open = MenuItem::with_id(app, "open", "Open GamesList", true, None::<&str>)?;
            let games = MenuItem::with_id(app, "games", "My games", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &games, &quit])?;

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GamesList")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "games" => {
                        let _ = open_site(app.clone(), "/games".to_string());
                    }
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
            if std::env::args().any(|a| a == "--pair") {
                let handle = app.handle().clone();
                let _ = pairing::start(handle);
            }
            if let Some(arg) = std::env::args().find(|a| a.starts_with("--site=")) {
                let path = arg.trim_start_matches("--site=").to_string();
                let handle = app.handle().clone();
                // After setup, so the window manager is ready.
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    if let Err(err) = open_site(handle, path) {
                        log::error!("open_site failed: {err}");
                    }
                });
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
