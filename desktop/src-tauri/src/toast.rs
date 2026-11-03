//! The "is this your game?" toast: a small window of our own, top-right.
//!
//! Not a Windows notification, for three reasons that each rule it out on
//! their own. `tauri-plugin-notification` sets the app's
//! `System.AppUserModel.ID` only when the exe is outside `target/debug` and
//! `target/release`, so toast buttons cannot be relied on in any dev run; its
//! `close()` is a documented no-op on Windows, so we could not close the toast
//! once answered; and Windows suppresses notifications while a game is
//! running, which is exactly when this fires. A window of our own also carries
//! the user's accent colour and the app's fonts, which a system toast cannot.
//!
//! It will not draw over a game in *exclusive* fullscreen — nothing can.
//! Borderless-fullscreen and windowed, which is nearly everything modern, are
//! fine — but only once [`force_to_front`] has run. Setting `always_on_top`
//! when the window is already topmost does not re-sort it, so a game that
//! grabs the foreground after the toast was built (the ordinary case — the
//! toast is built the moment the game is judged, not after it has settled
//! in) could still end up drawn over it without this.

use tauri::{AppHandle, Manager, PhysicalRect, WebviewUrl, WebviewWindowBuilder};

/// The window label. Also what `capabilities/default.json` has to list, or the
/// page cannot call a single command.
pub const LABEL: &str = "toast";

/// Logical size of the toast, and the gap it keeps from the screen edges.
///
/// Tall enough for the longest state — a failed link, whose explanation runs to
/// two lines. The card is centred, so the shorter states simply sit in more
/// space rather than looking padded out.
const SIZE: (f64, f64) = (340.0, 166.0);
const MARGIN: f64 = 16.0;

/// Where to put a window of `size` in the top-right of a work area.
///
/// Two unit systems meet here: `Monitor::work_area` is in physical pixels and
/// `WebviewWindowBuilder::position` is in logical ones, so the work area has to
/// be divided by the scale factor before it means anything to the builder. Get
/// that wrong on a 150% display and the toast lands off-screen.
///
/// The work area rather than the monitor size is what keeps it clear of the
/// taskbar (relevant here if the taskbar is docked to the top edge), and its
/// origin is not always `0,0` — a monitor placed left of the primary one has
/// a negative origin.
fn top_right(
    work_area: &PhysicalRect<i32, u32>,
    scale: f64,
    size: (f64, f64),
    margin: f64,
) -> (f64, f64) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let left = work_area.position.x as f64 / scale;
    let top = work_area.position.y as f64 / scale;
    let width = work_area.size.width as f64 / scale;

    (left + width - size.0 - margin, top + margin)
}

/// Show the toast, building the window if it is not up yet.
///
/// Built **hidden**: the page calls `toast_ready` once it has rendered, and
/// only then is it shown. This app has produced a blank white window three
/// times already, and the corner of someone's game is the worst possible place
/// for a fourth.
///
/// Takes just a `label` for the log line rather than a specific prompt type:
/// the page itself decides what to render, from `get_status` — this is
/// called for both the "is this a game?" prompt and the platform-confirm one.
pub fn show(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(LABEL) {
        // Already up for an earlier prompt — the page re-reads the status on
        // `status-changed`, so it will show this one.
        //
        // Logged as its own case rather than falling through silently: a
        // question raised into an already-open window used to leave no trace
        // at all, which made "the app never asked me about this game"
        // impossible to tell apart from "the app never noticed the game".
        log::info!("toast (already up) asking about {label}");
        let _ = window.show();
        force_to_front(&window);
        return;
    }

    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("toast.html".into()))
        .title("GamesList")
        .inner_size(SIZE.0, SIZE.1)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .transparent(true)
        // Launching a game must not be interrupted: the toast never takes the
        // keyboard away from whatever is starting up.
        .focused(false)
        .visible(false);

    #[cfg(windows)]
    {
        // Without this a transparent window flashes white as it is created.
        builder = builder.no_redirection_bitmap(true);
    }


    // Positioning is a nicety: a toast in the wrong corner still works, so a
    // monitor we cannot read is not a reason to say nothing at all.
    match app.primary_monitor() {
        Ok(Some(monitor)) => {
            let (x, y) = top_right(monitor.work_area(), monitor.scale_factor(), SIZE, MARGIN);
            builder = builder.position(x, y);
        }
        Ok(None) => log::warn!("no primary monitor; letting the toast centre itself"),
        Err(err) => log::warn!("could not read the primary monitor ({err}); toast centred"),
    }

    match builder.build() {
        Ok(_) => log::info!("toast asking about {label}"),
        Err(err) => log::error!("could not show the toast: {err}"),
    }
}

/// Re-sort the toast to the very front of the topmost band.
///
/// Setting `always_on_top(true)` when a window is already topmost is a
/// no-op for z-order — Windows only re-sorts the topmost band when the flag
/// actually *changes*. A game that keeps re-grabbing the foreground (overlay
/// hooks, or just regaining focus after launch) can end up ahead of an
/// already-topmost toast, which is what let a borderless-fullscreen game
/// cover it. Toggling the flag off and back on forces a re-sort every time,
/// rather than only on the first show.
pub fn force_to_front(window: &tauri::WebviewWindow) {
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);
}

/// Take the toast down, if it is up.
pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::{PhysicalPosition, PhysicalSize};

    fn rect(x: i32, y: i32, w: u32, h: u32) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition { x, y },
            size: PhysicalSize {
                width: w,
                height: h,
            },
        }
    }

    #[test]
    fn sits_in_the_top_right_with_a_margin() {
        let (x, y) = top_right(&rect(0, 0, 1920, 1080), 1.0, (340.0, 150.0), 16.0);
        assert_eq!((x, y), (1920.0 - 340.0 - 16.0, 16.0));
    }

    #[test]
    fn divides_a_scaled_display_down_to_logical_pixels() {
        // A 2560x1440 panel at 150%: 1706x960 logical. Treating the physical
        // numbers as logical would put the toast far off the right edge.
        let (x, y) = top_right(&rect(0, 0, 2560, 1440), 1.5, (340.0, 150.0), 16.0);
        assert!((x - (2560.0 / 1.5 - 340.0 - 16.0)).abs() < 0.001);
        assert!((y - 16.0).abs() < 0.001);
        assert!(x < 1706.0);
    }

    #[test]
    fn a_top_docked_taskbar_still_leaves_room_above_the_toast() {
        // A 48px taskbar docked to the top leaves a work area starting at
        // y=48, not y=0; the toast must sit below that, not under the
        // taskbar.
        let full = top_right(&rect(0, 0, 1920, 1080), 1.0, (340.0, 150.0), 16.0);
        let docked = top_right(&rect(0, 48, 1920, 1032), 1.0, (340.0, 150.0), 16.0);
        assert_eq!(docked.1, full.1 + 48.0);
    }

    #[test]
    fn honours_a_work_area_that_does_not_start_at_the_origin() {
        // A monitor to the left of the primary one has a negative origin, so
        // the position must be relative to the work area, not the screen size.
        let (x, y) = top_right(&rect(-1920, 0, 1920, 1080), 1.0, (340.0, 150.0), 16.0);
        assert_eq!(x, -340.0 - 16.0);
        assert_eq!(y, 16.0);
    }

    #[test]
    fn a_nonsense_scale_factor_does_not_divide_by_zero() {
        let (x, y) = top_right(&rect(0, 0, 1920, 1080), 0.0, (340.0, 150.0), 16.0);
        assert!(x.is_finite() && y.is_finite());
        assert_eq!((x, y), (1920.0 - 340.0 - 16.0, 16.0));
    }
}
