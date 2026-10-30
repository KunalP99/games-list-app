//! Getting a device token without anybody copying one.
//!
//! The app opens a listener on localhost, then opens the site's pair page in
//! its own window with that address as the callback. The user signs in as
//! normal, approves once, and the page redirects to the listener with the
//! token — the standard flow for native apps (RFC 8252).
//!
//! The site checks that the callback really is loopback before it will issue
//! anything (`isLoopbackCallback` in lib/agent-auth.ts), so a token cannot be
//! redirected off this machine.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::config;
use crate::tracker::Tracker;

/// How long to wait for the user to finish signing in and approving.
const PAIRING_TIMEOUT: Duration = Duration::from_secs(10 * 60);

pub fn start(app: AppHandle) -> Result<(), String> {
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

    let parsed = url.parse().map_err(|_| "could not build the pairing URL".to_string())?;
    WebviewWindowBuilder::new(&app, "pair", WebviewUrl::External(parsed))
        .title("Connect GamesList")
        .inner_size(520.0, 760.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

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
                            finish(&app, token);
                            break;
                        }
                        None => respond(&mut stream, FAILED_PAGE),
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

fn finish(app: &AppHandle, token: String) {
    let tracker = app.state::<Tracker>();
    {
        let mut config = tracker.config.lock().unwrap();
        config.token = Some(token);
        config::save(&tracker.data_dir, &config);
    }
    if let Some(window) = app.get_webview_window("pair") {
        let _ = window.close();
    }
    if let Some(main) = app.get_webview_window("main") {
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
