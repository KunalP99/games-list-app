//! Getting a device token without anybody copying one.
//!
//! The app opens a listener on localhost, then navigates the *main* window
//! itself to the site's pair page, with that address as the callback. The
//! user signs in as normal, approves once, and the page redirects to the
//! listener with the token — the standard flow for native apps (RFC 8252).
//!
//! This used to open a second, separate window for the pair page. That window
//! had no diagnostics of its own and, on a machine whose `config.json` held a
//! stale `api_base` from local testing, showed up as a blank white popup with
//! nothing to go on — confirmed live, and "same error as before" the moment
//! it was reported, since a second window was exactly the kind of thing
//! already blamed for an unrelated blank-window bug earlier. Navigating the
//! one window the user is already looking at sidesteps the whole class: there
//! is no second window left to go blank, and the bad `api_base` that caused
//! this specific instance is now also reset by `sign_out` (see lib.rs).
//!
//! The site checks that the callback really is loopback before it will issue
//! anything (`isLoopbackCallback` in lib/agent-auth.ts), so a token cannot be
//! redirected off this machine.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::config;
use crate::tracker::Tracker;

/// How long to wait for the user to finish signing in and approving.
const PAIRING_TIMEOUT: Duration = Duration::from_secs(10 * 60);

pub fn start(app: AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("no main window")?;
    // Captured now, while it's still pointed at the app's own local UI, so
    // `finish` has something to navigate back to once pairing is done —
    // there is no other record of what that URL was.
    let return_url = main.url().map_err(|e| e.to_string())?;

    // Port 0 asks the OS for a free one, and binding to 127.0.0.1 (rather than
    // 0.0.0.0) means nothing outside this machine can reach it.
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let base = app.state::<Tracker>().snapshot_config().base();
    let label = hostname();
    let url = format!(
        "{base}/settings/devices/pair?callback=http%3A%2F%2F127.0.0.1%3A{port}%2Fcb&label={}",
        urlencode(&label)
    );

    log::info!("pairing: navigating the main window to {url}");
    let parsed = url.parse().map_err(|_| "could not build the pairing URL".to_string())?;
    main.navigate(parsed).map_err(|e| e.to_string())?;

    // Set once pairing concludes, success or cancel, so the poller below
    // stops immediately instead of continuing to check the window's URL for
    // up to ten more minutes — including, briefly, while that URL is the
    // loopback callback itself (see the host check below), which is exactly
    // what let this poller race the real completion and drag the window back
    // to the pair page before `finish` ever got a chance to show the result.
    let done = Arc::new(AtomicBool::new(false));

    // Bring the window back to the approve screen once the user has signed in.
    //
    // Signing in redirects to /dashboard, and Next does that as a client-side
    // router navigation, so there is no new top-level navigation to catch —
    // the window simply sits there on the games list while the app waits
    // forever. Polling the window's URL is the only thing that reliably
    // notices.
    {
        let app = app.clone();
        let pair_url = url.clone();
        let done = done.clone();
        std::thread::spawn(move || {
            let deadline = Instant::now() + PAIRING_TIMEOUT;
            while Instant::now() < deadline && !done.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(700));
                if done.load(Ordering::Relaxed) {
                    return;
                }
                let Some(window) = app.get_webview_window("main") else {
                    return; // app is closing
                };
                let Ok(current) = window.url() else { continue };
                // about:blank while the first page loads — not a real location.
                if current.scheme() != "http" && current.scheme() != "https" {
                    continue;
                }
                // The loopback callback itself (127.0.0.1) is never a page to
                // react to — it's the signal this whole flow is waiting for,
                // not a place the user organically navigated to. Checking the
                // host, not just the path, is what makes this safe for any
                // request to that address, not only the one path this code
                // happens to send it to today.
                if current.host_str() == Some("127.0.0.1") {
                    continue;
                }
                let path = current.path();

                // Mid-flow pages: leave them alone.
                if path.starts_with("/settings/devices/pair") || path.starts_with("/login") || path.starts_with("/auth") {
                    continue;
                }

                log::info!("pairing: signed in and landed on {path}, returning to the approve screen");
                if let Ok(target) = pair_url.parse() {
                    let _ = window.navigate(target);
                }
            }
        });
    }

    std::thread::spawn(move || {
        let deadline = Instant::now() + PAIRING_TIMEOUT;
        loop {
            if Instant::now() > deadline {
                break;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0u8; 2048];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]);

                    match token_from_request(&request) {
                        Some(token) => {
                            respond(&mut stream, CONNECTED_PAGE);
                            done.store(true, Ordering::Relaxed);
                            finish(&app, Some(token), return_url.clone());
                            break;
                        }
                        // No token — Cancel on the pair page, which (now that
                        // it's loaded in the main window rather than a
                        // disposable popup) hits this same loopback address
                        // instead of calling window.close(), so there is
                        // still a real window to bring back to the app's own
                        // UI rather than leaving it stuck on a dead end.
                        None => {
                            respond(&mut stream, FAILED_PAGE);
                            done.store(true, Ordering::Relaxed);
                            finish(&app, None, return_url.clone());
                            break;
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(250));
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

fn finish(app: &AppHandle, token: Option<String>, return_url: tauri::Url) {
    // `None` is a cancel, not a success — nothing to save, just a window to
    // bring back.
    if let Some(token) = token {
        let tracker = app.state::<Tracker>();
        let mut config = tracker.config.lock().unwrap();
        config.token = Some(token);
        config::save(&tracker.data_dir, &config);
    }
    if let Some(main) = app.get_webview_window("main") {
        // Back to the app's own UI, in the same window pairing happened in —
        // it will read the freshly saved token on its next status refresh
        // and render as signed in, same as any other state change.
        let _ = main.navigate(return_url);
        let _ = main.show();
        let _ = main.set_focus();
    }
    let _ = app.emit("status-changed", ());
}

/// Pull `token` out of the request line, e.g. `GET /cb?token=glk_abc HTTP/1.1`.
fn token_from_request(request: &str) -> Option<String> {
    let line = request.lines().next()?;
    let target = line.split_whitespace().nth(1)?;
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(("token", value)) = pair.split_once('=').map(|(k, v)| (k, v)) {
            let value = urldecode(value);
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn respond(stream: &mut std::net::TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "This PC".to_string())
}

fn urlencode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn urldecode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

const CONNECTED_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Connected</title>\
<body style=\"font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#09090b;color:#fafafa\">\
<div style=\"text-align:center\"><p style=\"font-size:40px;margin:0\">&#9989;</p>\
<h1 style=\"font-size:18px;margin:8px 0 4px\">Connected</h1>\
<p style=\"color:#a1a1aa;margin:0\">You can close this window.</p></div></body>";

const FAILED_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Not connected</title>\
<body style=\"font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#09090b;color:#fafafa\">\
<div style=\"text-align:center\"><h1 style=\"font-size:18px;margin:0 0 4px\">Nothing to connect</h1>\
<p style=\"color:#a1a1aa;margin:0\">That request had no token. Try connecting again from the app.</p></div></body>";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_token_from_the_callback() {
        let request = "GET /cb?token=glk_abc123 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert_eq!(token_from_request(request).as_deref(), Some("glk_abc123"));
    }

    #[test]
    fn handles_other_parameters_and_encoding() {
        let request = "GET /cb?state=1&token=glk%5Fabc HTTP/1.1\r\n\r\n";
        assert_eq!(token_from_request(request).as_deref(), Some("glk_abc"));
    }

    #[test]
    fn returns_nothing_when_there_is_no_token() {
        assert!(token_from_request("GET /cb HTTP/1.1\r\n\r\n").is_none());
        assert!(token_from_request("GET /cb?token= HTTP/1.1\r\n\r\n").is_none());
        assert!(token_from_request("").is_none());
    }

    #[test]
    fn round_trips_a_machine_name_through_the_query_string() {
        assert_eq!(urldecode(&urlencode("Kunal's PC")), "Kunal's PC");
        assert_eq!(urlencode("DESKTOP-ABC"), "DESKTOP-ABC");
    }
}
