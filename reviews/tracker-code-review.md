# Code review — GamesList desktop tracker (Tauri 2 / Rust)

Reviewed: 2026-11-03 · Scope: `desktop/src-tauri/src/*.rs`, `desktop/src/*` (UI), `tauri.conf.json`, capabilities
Method: static reading only — no `cargo test`, `clippy` or app run during the review.
Server-side agent routes (`app/api/agent/*`) are covered in `website-code-review.md` (see M1 there).

Legend: **Confirmed** = traced in the code. **Potential** = depends on runtime/OS behaviour I couldn't verify (noted).
Tick each box as you resolve it.

No Critical findings. The security posture is good overall; the problems are mostly about accuracy of logged hours, wrong auto-identification, and server cost.

---

## High

### [ ] T-H1. Non-games can be auto-filed as Ambient and tracked without asking — Potential (high impact)
`detect.rs:59-61, 252-254`, `tracker.rs` (`identify_guessed_titles` → `identify_by_title`), `app/api/agent/identify/route.ts:129-133`

**Problem:** The game test is "visible window + loads `d3d11.dll` / `dxgi.dll` / `opengl32.dll`…". Every Chromium/Electron app and most modern desktop apps load those, so anything not on the hand-kept `IGNORED` list (Notion, Obsidian, Postman, GitHub Desktop, 1Password, Unity/Blender editors…) is judged a game after 20s. Then `identify_guessed_titles` turns the exe name into a title and the server **auto-adds** it as an Ambient game if IGDB has an exactly-named title. Short app names often collide with old games (IGDB has many one-word titles). Result: a productivity app silently becomes a "game" with hours logged; the user only sees a toast. The server's `lib/known-software.ts` / `lib/generic-executable-names.ts` are not consulted on this path.

**Why it matters:** Wrong hours, polluted libraries, activity/achievement noise — and the guessed-title path is the least trustworthy signal yet the only one that writes without a question.

**Fix (pick one or combine):**
- Only allow the guessed-title path to **auto-add** when the exe is under a `GAME_FOLDER_HINTS` path; otherwise turn a match into a *confident toast* ("Is this *Obsidian*?") instead of filing it.
- Server-side: in `identify`, reject `titleGuess` when `isGenericExecutableName(exeName)` or the exe is in `KNOWN_SOFTWARE`.
```rust
// tracker.rs — identify_guessed_titles
let in_game_folder = candidate.path.as_deref()
    .is_some_and(|p| detect::GAME_FOLDER_HINTS.iter().any(|h| p.contains(h)));
if !in_game_folder { continue; } // fall through to maybe_prompt instead of auto-adding
```

### [ ] T-H2. Unresolved programs are re-sent to `/api/agent/identify` every poll, forever — Confirmed
`tracker.rs` — `identify_global_exe_links`, `identify_by_title` (`_ => {}` arm), `identify_steam_games` (`_ => {}`)

**Problem:** Only `untracked` / `notAGame` are remembered. `unknown` (the normal answer for anything IGDB doesn't exactly match) is not, by design on the server ("a search miss proves nothing") — but the client has no backoff either. Every 10 s, for every judged candidate still running, the loop makes up to **three** identify calls (global-link lookup, then a guessed-title IGDB search, plus Epic/EA/Battle.net if applicable). Each is a Vercel function invocation plus an IGDB request on a shared Twitch app (IGDB limit ≈4 req/s across *all* users). A single unrecognised windowed app open all day ≈ 8,600 × 2–3 requests per user per day. The calls are sequential with 15 s timeouts, so a slow site also delays detecting a game starting.

**Fix:** Per-run backoff keyed by exe name.
```rust
// Shared
pub retry_after: HashMap<String, Instant>,

// before calling identify for a candidate:
if shared.retry_after.get(&candidate.exe_name).is_some_and(|t| Instant::now() < *t) { continue; }
// on "unknown" or Err:
shared.retry_after.insert(candidate.exe_name.clone(), Instant::now() + Duration::from_secs(600));
```
(Double the delay on each miss if you want; 10 minutes flat already removes ~98% of calls.)

### [ ] T-H3. Play time is lost on Quit, shutdown, sign-out and unlink — Confirmed
`lib.rs:515` (`"quit" => app.exit(0)`), `lib.rs:574` (no run-event handler), `lib.rs:390-392` (`sign_out`), `lib.rs:182-184` (`unlink_executable`), checkpoint interval 15 min (`app/api/agent/state/route.ts:83`)

**Problem:** A session's minutes only reach the server on a checkpoint (every 15 min) or on `stop_session`. Nothing calls `stop_session` when the app exits (tray Quit, Windows shutdown/restart, update install), or when the user signs out or unlinks the running exe — the session is just dropped. On average ~7.5 minutes per such session are lost, and the `play_sessions` row never gets `ended_at`, so the "Playing now" badge lingers for 20 minutes on the website.

**Fix:**
1. Handle exit and send the final write with a short timeout:
```rust
.build(tauri::generate_context!())
.expect("error while building GamesList")
.run(|app, event| {
    if let tauri::RunEvent::ExitRequested { .. } = event {
        let app = app.clone();
        tauri::async_runtime::block_on(async move {
            let cfg = app.state::<Tracker>().snapshot_config();
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(3),
                tracker::stop_session(&app, &cfg.base(), &cfg.token.unwrap_or_default()),
            ).await;
        });
    }
});
```
2. Call `stop_session` (not `session = None`) in `sign_out` and `unlink_executable`.
3. Drop the checkpoint interval to ~5 min — it's one tiny request and caps the worst-case loss for crashes/power cuts.

### [ ] T-H4. Permanent server rejections are queued and retried forever — Confirmed
`api.rs` (`post_session`: any non-2xx → `Err`), `tracker.rs` (`send_or_queue`, `flush_queue`)

**Problem:** Every non-success response is treated as "offline". A 400 never succeeds on retry — e.g. a PC clock running >5 minutes fast makes the server answer `startedAt is in the future` for *every* session, so all play time silently piles up in `pending.json` and is re-posted every 10 s indefinitely. After a device is revoked (401) the same happens. The queue has no size cap.

**Fix:** Distinguish transient from permanent failures.
```rust
pub enum SendError { Transient(String), Rejected(String) }
// network error / 5xx / 429 → Transient (queue it)
// 400 / 401 / 403 / 404     → Rejected (log, surface in last_error, do NOT queue)
```
Also cap the queue (e.g. 500 items) and surface "clock is wrong" clearly when the server says so.

---

## Medium

### [ ] T-M1. Pairing callback has no `state` nonce, and any connection ends pairing — Confirmed (+ Potential race)
`pairing.rs` (listener thread, `token_from_request`)

**Problems:**
1. No `state` parameter (RFC 8252 §8.9). Whatever connects to the port first with `?token=` wins — a local process or a page in the user's browser that finds the port could inject *its own* token, pairing the app to an attacker's account (your play data then flows there).
2. A connection **without** a token is answered with the failure page and pairing stops (`done = true; break`). Port scanners, browser preconnects, or a stray request kill a legitimate pairing.
3. *Potential:* the listener is non-blocking and on Windows an accepted socket inherits that mode, so `stream.read` can return `WouldBlock` before the request bytes arrive → `unwrap_or(0)` → empty request → "Nothing to connect". This would show up as intermittent pairing failures.

**Fix:**
```rust
let state = uuid::Uuid::new_v4().simple().to_string();
// include &state=… in the callback URL the site echoes back; on accept:
stream.set_nonblocking(false).ok();
stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
match parse(&request) {
    Some((token, s)) if s == state => { /* success */ }
    _ => { respond(&mut stream, FAILED_PAGE); continue; } // ignore, keep listening
}
```
(The website's `approveDevicePairing` would need to pass `state` through to the redirect.)

### [ ] T-M2. Epic / Battle.net matching can name the wrong game — Confirmed
`launchers.rs` (`parse_manifest`, `display_name_for_exe`), `battlenet.rs` (`display_name_for_exe`)

**Problems:**
1. Match is `exe_path.starts_with(install_location)` with no trailing separator, so `D:\Epic\Hades` also matches `D:\Epic\Hades II\Hades2.exe`. `find` takes whichever manifest was read first → Hades II can be auto-filed as *Hades*.
2. CLAUDE.md says Epic matching also checks the `LaunchExecutable` basename (to disambiguate Quixel Bridge / Fab plugins sharing Unreal's folder). The code parses `LaunchExecutable` only to validate it, then discards it — `EpicGame` doesn't store it.

**Fix:** Compare against `install_location + '\\'`; prefer the *longest* matching install path; store and check the launch exe basename as the docs describe.
```rust
let root = format!("{}\\", g.install_location.to_lowercase().trim_end_matches(['\\', '/']));
exe_path.starts_with(&root)
```

### [ ] T-M3. Exe names are lowercased before title-guessing, defeating camelCase splitting — Confirmed
`detect.rs:101` (`to_lowercase()`), `matching.rs` (`tokens`, `guess_title_from_exe`)

**Problem:** `tokens()` splits `VampireSurvivors` → `vampire survivors` on case changes, but every runtime exe name is already lowercase, so `guess_title_from_exe` sends `"Vampiresurvivors"` to IGDB, which rarely matches. The unit tests pass because they use mixed-case input (`"VampireSurvivors.exe"`) that production never produces.

**Fix:** Keep the original-case name on `Candidate` (e.g. `display_name`) for guessing; keep the lowercase one as the matching key. Add a test that runs a candidate built by the real `candidates()` path, not a hand-written name.

### [ ] T-M4. Sign-out leaves the token valid and leaks queued sessions into the next account — Confirmed
`lib.rs:372-393` (`sign_out`), `config.rs` (`pending.json`, `asked.json`)

**Problem:** `sign_out` deletes the token locally but never revokes it server-side (`/api/agent/devices/revoke` exists), so a copied `config.json` keeps working. `pending.json` and `asked.json` survive sign-out; if someone else pairs on the same PC, queued sessions from account A are flushed with account B's token and may match B's games by app id / exe.

**Fix:** In `sign_out`: flush the queue (or discard it), call revoke for this device, then clear `pending.json` (and arguably `asked.json`). Tagging queue items with the device id would make this impossible by construction.

### [ ] T-M5. Heavy filesystem work on every poll, before the cached judge — Confirmed
`tracker.rs` (`identify_by_title`: `resolve(path)` runs before `judge.judge`), `ea.rs` (`find_title_for_exe` probes up to 6 directories), `launchers.rs` / `battlenet.rs` (re-read all manifests every call), `config::load_asked` (read from disk ~5× per tick)

**Problem:** While nothing is being tracked, every 10 s the EA resolver probes `__Installer\installerdata.xml` up to 6 times **for every running process** (hundreds), and Epic/Battle.net manifests are re-read and re-parsed. Mostly cheap misses, but it's continuous disk activity from a background app.

**Fix:** Call `judge.judge(candidate)` (cached per PID) *before* `resolve`; cache launcher manifests and re-read only when the directory's modified time changes; load `asked` once per tick and pass it down.

### [ ] T-M6. Sleep/hibernate may be counted as play time — Potential
`tracker.rs` (`Session::minutes` uses `Instant::elapsed`), main loop

**Problem:** If the PC sleeps with a game open, the process is still there on wake and the session continues. Whether sleep time is included depends on `Instant` semantics on Windows (QPC); if it is, an overnight sleep logs as hours of play, and the server's wall-clock bound won't catch it. Separately, a game left open AFK counts in full — arguably a product decision, but worth deciding explicitly.

**Fix:** Detect gaps: if the loop's 10 s sleep took far longer in wall-clock time (e.g. >2 min), end the session at the pre-gap time and start a new one if the game is still running.
```rust
let before = Utc::now();
tokio::time::sleep(Duration::from_secs(poll_seconds)).await;
if (Utc::now() - before).num_seconds() > 120 { /* close session at `before` */ }
```

### [ ] T-M7. The session/queue core has no tests; identify loops are near-duplicates — Improvement
`tracker.rs` (837 lines, 0 tests), `api.rs` (0 tests)

The pure parsers are well tested (≈77 Rust tests across `detect`, `matching`, `steam`, `ea`, `launchers`, `battlenet`, `pairing`, `config`, `toast`), but the parts that decide what hours get logged — start/stop transitions, queueing, flush, the identify result handling — have none. `identify_steam_games` and `identify_global_exe_links` repeat `identify_by_title`'s result-handling `match` almost verbatim; the "only remember `untracked`" rule (documented as important in CLAUDE.md) has to be kept correct in three places. **Fix:** extract a pure `fn on_identify_result(result, &mut Shared, key) -> Outcome` and test it; make the loop's decision step (`matched`, `current_game_id`) a pure function and table-test it.

---

## Low

- [ ] **T-L1. Wrong "not tracked" message** — `tracker.rs` `stop_session` matches `reason == "not_playing"`, but the server sends `"not_trackable"` (`app/api/agent/session/route.ts:79`) or `"no_match"`. The specific explanation never shows. Confirmed.
- [ ] **T-L2. `set_api_base` ships in release builds** — `lib.rs:396-404`. Documented as console-only for testing; gate it with `#[cfg(debug_assertions)]` (and its entry in `generate_handler!`) so nothing in production can repoint the app.
- [ ] **T-L3. `csp: null`** — `tauri.conf.json`. The local UI uses `textContent` throughout (good — no injection found), so this is defence in depth: set a CSP for the bundled pages. Keep `capabilities/default.json` free of `remote` URLs — that is what stops the website (loaded in the main window during pairing) from calling Tauri commands.
- [ ] **T-L4. Non-atomic config writes, errors swallowed** — `config.rs` `write_json` uses `fs::write` and ignores failures. A crash mid-write corrupts `config.json` → `read_json` returns `None` → app silently unpaired; a corrupt `pending.json` loses queued sessions. Write to a temp file and `rename`; log write errors.
- [ ] **T-L5. A panic stops tracking silently** — every lock is `.lock().unwrap()` and `run_loop` is a bare `spawn`. A panic while holding a lock poisons it, every later `unwrap` panics, the loop dies, and the tray icon stays up looking healthy. Use `lock().unwrap_or_else(|e| e.into_inner())` (or `parking_lot`), and restart/log if the loop task ends.
- [ ] **T-L6. Failed update can't be retried** — `install_update` `take()`s the pending update before downloading; on failure the modal can't retry until relaunch. Put it back on error.
- [ ] **T-L7. Token stored in plaintext** — `config.json` in AppData, shared by every build (as the `sign_out` comment notes). Any process running as the user can read it. Consider Windows Credential Manager (`keyring` crate). Low, since the token can only log hours / manage links for that user.
- [ ] **T-L8. Franchise names score as confident** — `matching.rs` prefix/substring rules give 85/78 for e.g. `minecraft.exe` vs "Minecraft Dungeons". Only affects suggestions the user confirms; worth a test case or two.
- [ ] **T-L9. Housekeeping** — `agent/gameslist-agent.ps1` (prototype) is superseded; delete or mark deprecated. `desktop/package.json` has a placeholder `test` script; wire it to `cargo test --manifest-path src-tauri/Cargo.toml`. No CI runs the Rust tests.

---

## What's done well

- UI renders all server/user strings with `textContent`; `innerHTML` only ever gets static strings.
- Updater is signature-verified (minisign pubkey) from GitHub releases.
- Pairing uses a loopback listener on an ephemeral port, and the site validates the callback is loopback-only.
- Remote website has no IPC access (capabilities list only local windows).
- `GameJudge` caches verdicts per PID, handles PID reuse and "not settled yet" properly, and is well tested.
- Toast is built hidden and shown only once painted, unfocused — considerate of a fullscreen game.
- Comments explain the *why* of every non-obvious decision, which made this review much faster.

---

## Overall assessment

A well-structured, thoughtfully commented Tauri app with sensible security defaults. The risks are not about attackers so much as **accuracy and cost**: hours are lost on exit and can pile up undeliverable; the weakest identification signal (guessed exe titles) can file non-games automatically; and unresolved programs generate a constant stream of server + IGDB calls. The untested part of the codebase (`tracker.rs`) is exactly the part that decides what gets logged.

### Top five
1. T-H3 — send the final write on exit / sign-out / unlink; shorter checkpoints.
2. T-H2 — backoff for `unknown` identify results.
3. T-H1 — stop auto-adding from guessed titles outside game folders.
4. T-H4 — don't queue permanent 4xx rejections; cap the queue.
5. T-M1 — `state` nonce + "ignore, don't abort" in the pairing listener.

### Architectural concerns
- `run_loop` mixes detection, identification, network I/O and UI pings in one long async function with sequential 15 s-timeout calls. Splitting it into a pure "decide" step (testable) and an "effects" step would make the session rules testable and let identification run off the critical path (e.g. a separate task) so a slow site never delays start/stop detection.
- Client and server each own half of the identify rules (what's remembered vs. what's cached). Writing the contract down in one place (or returning a `retryAfter` hint from the server) would stop the two from drifting.

### Prioritised action plan
1. **Quick wins (an evening):** T-L1 message fix, T-H3 sign-out/unlink → `stop_session`, checkpoint 15 → 5 min, T-L2 gate `set_api_base`, T-M2 trailing-separator fix.
2. **Next:** T-H2 backoff map, T-H4 transient vs rejected errors, T-H3 exit handler, T-M4 revoke + clear queue on sign-out.
3. **Then:** T-H1 auto-add policy (client + server guard), T-M1 pairing nonce (needs a small website change), T-M3 preserve original-case names.
4. **Ongoing:** T-M7 tests for the decision logic, T-M5 caching, T-L4/L5 robustness, CI running `cargo test`.
