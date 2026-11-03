// Status screen logic.
//
// Everything here is read-only reporting plus a few buttons; all the real work
// (watching, timing, sending) happens in Rust. The window can be closed at any
// point without stopping anything.

import { applyTheme } from './theme.js'
import { populatePlatformSelect } from './platforms.js'

const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event

const el = (id) => document.getElementById(id)

/**
 * Programs that are plainly not games, and what they are.
 *
 * The picker already leaves these out, so this only fires when someone goes
 * looking for one — but linking a browser means every minute it is open counts
 * as play time, which is worth one sentence of warning rather than silence.
 * Mirrors lib/known-software.ts on the website.
 */
const KNOWN_SOFTWARE = {
  'chrome.exe': 'web browser', 'msedge.exe': 'web browser', 'firefox.exe': 'web browser',
  'brave.exe': 'web browser', 'opera.exe': 'web browser', 'discord.exe': 'chat app',
  'slack.exe': 'chat app', 'teams.exe': 'chat app', 'spotify.exe': 'music player',
  'vlc.exe': 'media player', 'steam.exe': 'game launcher, not a game',
  'epicgameslauncher.exe': 'game launcher, not a game', 'battle.net.exe': 'game launcher, not a game',
  'galaxyclient.exe': 'game launcher, not a game', 'obs64.exe': 'streaming software',
  'code.exe': 'code editor', 'notepad.exe': 'text editor', 'excel.exe': 'spreadsheet app',
  'winword.exe': 'word processor', 'outlook.exe': 'email client', 'zoom.exe': 'video calls',
}

/** Paint the app in the user's accent, from the palette the site computed. */
/**
 * Elapsed time, counted from the session's real start.
 *
 * Shows seconds under an hour: a timer reading "0m" for a whole minute after
 * a game opens is the single thing that makes this look broken, when in fact
 * it is already tracking.
 */
function formatElapsed(seconds) {
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}

function formatSync(iso, queued, error) {
  if (queued > 0) return `${queued} session${queued === 1 ? '' : 's'} waiting to send`
  if (error) return error === 'unauthorized' ? 'Device was revoked — reconnect' : 'Offline — will retry'
  if (!iso) return 'Not synced yet'
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'Synced just now'
  if (mins < 60) return `Synced ${mins}m ago`
  return `Synced ${Math.floor(mins / 60)}h ago`
}

function renderPlaying(games) {
  const list = el('playing-list')
  list.innerHTML = ''

  if (games.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = 'Nothing set to Playing yet.'
    list.appendChild(li)
    return
  }

  for (const game of games) {
    const li = document.createElement('li')

    const title = document.createElement('span')
    title.className = 'game-title'
    title.textContent = game.title

    const hours = document.createElement('span')
    hours.className = 'game-hours'
    hours.textContent = `${game.hours ?? 0}h`

    const pill = document.createElement('span')
    // "Linked" means we can recognise it when it starts — either a Steam app
    // id or an executable the user has pointed at it.
    pill.className = `pill ${game.linked ? 'linked' : 'unlinked'}`
    pill.textContent = game.linked ? 'Linked' : 'Not linked'

    li.append(title, hours, pill)
    list.appendChild(li)
  }
}

/** The prompt currently shown here, so the buttons know what they're answering. */
let currentPrompt = null
/** The platform-confirm prompt currently shown, if any — see renderPlatformPrompt. */
let currentPlatformPrompt = null

// Mirrors toast.js's render() exactly — the toast's × leaves this card as the
// only place the question is still answerable, so the two must read as the
// same question, not a second, differently-worded one.
function renderPrompt(prompt) {
  const card = el('prompt-card')
  currentPrompt = prompt
  if (!prompt) {
    card.hidden = true
    return
  }
  card.hidden = false
  el('prompt-exe').textContent = prompt.exe_name
  el('prompt-error').hidden = true

  if (prompt.confident) {
    el('prompt-heading').textContent = 'Is this your game?'
    el('prompt-title').textContent = prompt.suggested_title
    el('prompt-named').hidden = false
    el('prompt-help').hidden = true
    el('prompt-yes').textContent = 'Yes'
    el('prompt-no').textContent = 'No'
  } else {
    el('prompt-heading').textContent = 'Is this a game?'
    el('prompt-named').hidden = true
    el('prompt-help').hidden = false
    el('prompt-yes').textContent = 'Pick it'
    el('prompt-no').textContent = 'Not a game'
  }
}

/**
 * Dismissing the update modal is deliberately in-memory only — this module
 * reloads fresh on every app launch, and the Rust side only checks once per
 * launch too, so "next time they open the app" already falls out of that
 * without needing anything persisted here.
 */
let updateDismissed = false

/**
 * Mirrors toast.js's own platform-prompt rendering exactly — same reasoning
 * as `renderPrompt` above: whichever window is open has to ask the same
 * question the same way.
 */
function renderPlatformPrompt(prompt) {
  const card = el('platform-prompt-card')
  currentPlatformPrompt = prompt
  if (!prompt) {
    card.hidden = true
    return
  }
  card.hidden = false
  el('platform-prompt-title').textContent = prompt.title
  el('platform-prompt-error').hidden = true
  populatePlatformSelect(el('platform-prompt-select'), prompt.current_platform)
}

/** The resume/replay prompt currently shown here, if any. */
let currentResumePrompt = null

/** Mirrors toast.js's own rendering exactly — same reasoning as renderPrompt. */
function renderResumePrompt(prompt) {
  const card = el('resume-prompt-card')
  currentResumePrompt = prompt
  if (!prompt) {
    card.hidden = true
    return
  }
  card.hidden = false
  el('resume-prompt-error').hidden = true
  const ambientButton = el('resume-prompt-ambient')
  if (prompt.kind === 'dnf') {
    el('resume-prompt-heading').textContent = `You dropped ${prompt.title} before — are you resuming it?`
    el('resume-prompt-yes').textContent = 'Resume'
    ambientButton.hidden = true
  } else if (prompt.kind === 'backlog') {
    // The one case with a real choice — the other two have exactly one
    // possible outcome, so they only ever show the single primary button.
    el('resume-prompt-heading').textContent = `You have ${prompt.title} in your backlog — set it to:`
    el('resume-prompt-yes').textContent = 'Set to Playing'
    ambientButton.hidden = false
  } else {
    el('resume-prompt-heading').textContent = `You already completed ${prompt.title} — is this a replay?`
    el('resume-prompt-yes').textContent = 'Yes, replay'
    ambientButton.hidden = true
  }
}

function renderUpdateModal(pendingUpdate) {
  const modal = el('update-modal')
  if (updateDismissed || !pendingUpdate) {
    modal.hidden = true
    return
  }
  el('update-version').textContent = pendingUpdate.version
  el('update-notes').textContent = pendingUpdate.notes ?? ''
  el('update-error').hidden = true
  modal.hidden = false
}

// Pairing starts itself the moment the app notices it isn't paired — no
// "Connect" button to click first. Guarded so a 30s refresh tick while
// already mid-flow (or one that lands right as the window is about to
// navigate away) doesn't fire it a second time; a failed attempt clears the
// guard so the next tick is free to retry.
let autoPairStarted = false

let startedAtMs = null
/** The site's base URL, for the in-window settings view — carried on every status refresh. */
let apiBase = null

function tickElapsed() {
  if (startedAtMs == null || Number.isNaN(startedAtMs)) return
  const seconds = Math.max(0, (Date.now() - startedAtMs) / 1000)
  el('status-elapsed').textContent = formatElapsed(seconds)
}

async function refresh() {
  let status
  try {
    status = await invoke('get_status')
  } catch {
    return
  }

  apiBase = status.api_base ?? apiBase
  applyTheme(status)
  el('dev-badge').hidden = !status.is_dev

  el('signed-out').hidden = status.paired
  el('signed-in').hidden = !status.paired
  el('who').textContent = status.paired
    ? (status.display_name ?? 'Signed in')
    : 'Not connected'

  if (!status.paired) {
    if (!autoPairStarted) {
      autoPairStarted = true
      invoke('start_pairing').catch(() => { autoPairStarted = false })
    }
    return
  }

  const tracking = status.tracking
  el('status-dot').classList.toggle('live', Boolean(tracking))
  el('status-label').textContent = tracking ? 'Tracking' : 'Not tracking'
  el('status-game').textContent = tracking ? tracking.title : ''
  el('status-elapsed').hidden = !tracking

  // Keep the server's start time, not a local counter: the window can be
  // closed and reopened mid-session, and a local counter would restart at zero.
  startedAtMs = tracking ? Date.parse(tracking.started_at) : null
  tickElapsed()

  renderPlaying(status.playing ?? [])
  renderPrompt(status.pending_prompt)
  renderPlatformPrompt(status.pending_platform_prompt)
  renderResumePrompt(status.pending_resume_prompt)
  renderUpdateModal(status.pending_update)
  el('sync-line').textContent = formatSync(status.last_sync, status.queued, status.last_error)
}

// ── Buttons ─────────────────────────────────────────────────────────────────
el('btn-connect').addEventListener('click', () => invoke('start_pairing'))
/**
 * Settings, in this window — Devices only.
 *
 * Used to open the website's settings page in a second window, which had
 * the same problem the link panel already ran into: a webview session that
 * could expire, and on first open (before anything had navigated it
 * anywhere) a blank white page with no explanation. An iframe was tried
 * next, but the main window's own origin and the website's are different,
 * so the website's auth cookie (SameSite=Lax) is a third-party cookie from
 * the iframe's point of view and never arrives — it just showed a login
 * form. Native is the only thing that actually works here, so this is
 * scoped to the one section that's genuinely about this agent (Devices);
 * Profile/Security/Appearance/Wheel stay on the website.
 */
el('btn-settings').addEventListener('click', () => {
  el('settings-view').hidden = false
  loadDevices()
})
el('settings-back').addEventListener('click', () => { el('settings-view').hidden = true })

// Clears the stored device token so the next launch (or the next pairing)
// starts from Connect again — the one thing a freshly installed copy can't
// tell on its own, since it reads the same config.json any other build on
// this machine already wrote.
el('btn-sign-out').addEventListener('click', async () => {
  await invoke('sign_out')
  el('settings-view').hidden = true
  refresh()
})

el('update-now').addEventListener('click', async () => {
  const button = el('update-now')
  const error = el('update-error')
  error.hidden = true
  button.disabled = true
  button.textContent = 'Installing…'
  try {
    await invoke('install_update')
    // On Windows a successful install exits the app before this resolves —
    // reaching here means it didn't, so leave the button in its error state
    // below rather than claiming success.
  } catch (err) {
    error.textContent = String(err)
    error.hidden = false
    button.disabled = false
    button.textContent = 'Update Now'
  }
})
el('update-later').addEventListener('click', () => {
  updateDismissed = true
  el('update-modal').hidden = true
})

el('platform-prompt-save').addEventListener('click', async () => {
  if (!currentPlatformPrompt) return
  const platform = el('platform-prompt-select').value
  const button = el('platform-prompt-save')
  const error = el('platform-prompt-error')
  error.hidden = true
  button.disabled = true
  try {
    await invoke('set_platform', { platform })
    refresh()
  } catch (err) {
    error.textContent = String(err)
    error.hidden = false
  } finally {
    button.disabled = false
  }
})

el('resume-prompt-yes').addEventListener('click', async () => {
  if (!currentResumePrompt) return
  const button = el('resume-prompt-yes')
  const error = el('resume-prompt-error')
  error.hidden = true
  button.disabled = true
  try {
    const status = currentResumePrompt.kind === 'backlog' ? 'playing' : undefined
    await invoke('respond_to_resume_prompt', { accept: true, status })
    refresh()
  } catch (err) {
    error.textContent = String(err)
    error.hidden = false
  } finally {
    button.disabled = false
  }
})
el('resume-prompt-ambient').addEventListener('click', async () => {
  if (!currentResumePrompt) return
  const button = el('resume-prompt-ambient')
  const error = el('resume-prompt-error')
  error.hidden = true
  button.disabled = true
  try {
    await invoke('respond_to_resume_prompt', { accept: true, status: 'ambient' })
    refresh()
  } catch (err) {
    error.textContent = String(err)
    error.hidden = false
  } finally {
    button.disabled = false
  }
})
el('resume-prompt-no').addEventListener('click', async () => {
  if (!currentResumePrompt) return
  await invoke('respond_to_resume_prompt', { accept: false }).catch(() => {})
  refresh()
})

function formatLastSeen(iso) {
  if (!iso) return 'Never connected'
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function showDeviceMsg(text, ok) {
  const msg = el('device-msg')
  msg.textContent = text
  msg.className = ok ? 'panel-msg ok' : 'panel-msg bad'
  msg.hidden = false
}

async function loadDevices() {
  const list = el('device-list')
  list.innerHTML = '<li class="empty">Loading…</li>'
  let devices
  try {
    devices = await invoke('list_devices')
  } catch (err) {
    list.innerHTML = ''
    showDeviceMsg(String(err), false)
    return
  }

  list.innerHTML = ''
  if (devices.length === 0) {
    list.innerHTML = '<li class="empty">No PCs paired yet.</li>'
    return
  }

  for (const device of devices) {
    const li = document.createElement('li')

    const label = document.createElement('span')
    label.className = 'game-title'
    label.textContent = device.isThisDevice ? `${device.label} (this PC)` : device.label

    const seen = document.createElement('span')
    seen.className = 'game-hours'
    seen.textContent = formatLastSeen(device.lastSeenAt)

    const revoke = document.createElement('button')
    revoke.className = 'ghost unlink'
    revoke.textContent = 'Revoke'
    revoke.addEventListener('click', async () => {
      revoke.disabled = true
      revoke.textContent = 'Revoking…'
      try {
        await invoke('revoke_device', { deviceId: device.id })
        showDeviceMsg(`Removed ${device.label}. That device can no longer log hours.`, true)
        loadDevices()
      } catch (err) {
        revoke.disabled = false
        revoke.textContent = 'Revoke'
        showDeviceMsg(String(err), false)
      }
    })

    li.append(label, seen, revoke)
    list.appendChild(li)
  }
}

el('device-create').addEventListener('click', async () => {
  const input = el('device-label')
  const label = input.value.trim()
  if (!label) return
  el('device-msg').hidden = true
  el('device-token-wrap').hidden = true
  const button = el('device-create')
  button.disabled = true
  try {
    const token = await invoke('create_device_token', { label })
    el('device-token-value').textContent = token
    el('device-token-wrap').hidden = false
    input.value = ''
    showDeviceMsg('Device added. Copy the token now — it is not shown again.', true)
    loadDevices()
  } catch (err) {
    showDeviceMsg(String(err), false)
  } finally {
    button.disabled = false
  }
})

el('device-token-copy').addEventListener('click', () => {
  navigator.clipboard?.writeText(el('device-token-value').textContent ?? '')
})
/**
 * Linking, in this window.
 *
 * This used to open the website's link page in a second window. That window
 * depended on a webview session that could expire and on the site being
 * reachable, and when either failed it showed a blank page with no
 * explanation. Everything needed is already here: the running programs come
 * from the watcher, the games from the status it already holds.
 */
async function openLinkPanel(preselectExe = null) {
  const panel = el('link-panel')
  const exeSelect = el('link-exe')
  el('link-msg').hidden = true

  const [programs, status] = await Promise.all([
    invoke('running_programs').catch(() => []),
    invoke('get_status').catch(() => null),
  ])

  exeSelect.innerHTML = ''
  // No program detected for us — e.g. opened from the plain "Link a game"
  // button — so start on a blank choice rather than whichever program the
  // browser's <select> would otherwise default to showing as "selected".
  if (!preselectExe) {
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = '— Select a program —'
    exeSelect.appendChild(placeholder)
  }
  for (const exe of programs) {
    const opt = document.createElement('option')
    opt.value = exe
    opt.textContent = exe
    exeSelect.appendChild(opt)
  }
  // The program we were asked about might not be in the picker's list — it is
  // still running, so offer it explicitly rather than making the user hunt.
  if (preselectExe && !programs.includes(preselectExe)) {
    const opt = document.createElement('option')
    opt.value = preselectExe
    opt.textContent = preselectExe
    exeSelect.insertBefore(opt, exeSelect.firstChild)
  }
  if (exeSelect.options.length === 0) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = 'No programs found — start the game first'
    exeSelect.appendChild(opt)
  }
  if (preselectExe) exeSelect.value = preselectExe

  const gameSelect = el('link-game')
  gameSelect.innerHTML = ''
  // Always starts blank. Nothing here is ever a confident suggestion — the
  // confident case is handled entirely by the toast's Yes button, which never
  // opens this panel — so defaulting to whichever game the <select> happened
  // to list first was never actually a suggestion, just an accident of
  // ordering. That accident is what made an unrelated game (say, Baldur's
  // Gate 3) look like the app's answer to "is this your game?" when the real
  // answer was "I don't know."
  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = '— Select a game —'
  gameSelect.appendChild(blank)
  for (const game of status?.playing ?? []) {
    const opt = document.createElement('option')
    opt.value = game.id
    opt.textContent = game.linked ? `${game.title} (already linked)` : game.title
    gameSelect.appendChild(opt)
  }

  // Kept so the game-select handler below (a separate listener, fired later)
  // can look up the platform a just-picked game already has.
  lastLinkPlaying = status?.playing ?? []
  populatePlatformSelect(el('link-platform'), 'PC (Windows)')

  renderLinked(status)
  showExeWarning()
  panel.hidden = false
}

/** The games list from the most recent `openLinkPanel` call — see above. */
let lastLinkPlaying = []

function showExeWarning() {
  const exe = el('link-exe').value
  const what = KNOWN_SOFTWARE[exe]
  const warn = el('link-warning')
  if (!what) {
    warn.hidden = true
    el('link-save').textContent = 'Link them'
    return
  }
  warn.textContent = `${exe} looks like a ${what}. Every minute it is open would count as play time.`
  warn.hidden = false
  // Not a block — an unusual launcher should still be linkable — but the
  // button should say what it is about to do.
  el('link-save').textContent = 'Link it anyway'
}

/** The links that already exist, each with a way to undo it. */
function renderLinked(status) {
  const wrap = el('linked-list-wrap')
  const list = el('linked-list')
  const entries = Object.entries(status?.executables ?? {})
  list.innerHTML = ''
  wrap.hidden = entries.length === 0

  for (const [exe, gameId] of entries) {
    const game = (status?.playing ?? []).find(g => g.id === gameId)
    const li = document.createElement('li')

    const label = document.createElement('span')
    label.className = 'game-title'
    label.textContent = `${exe} → ${game ? game.title : 'a game not currently Playing'}`

    const remove = document.createElement('button')
    remove.className = 'ghost unlink'
    remove.textContent = 'Remove'
    remove.addEventListener('click', async () => {
      remove.disabled = true
      remove.textContent = 'Removing…'
      try {
        await invoke('unlink_executable', { exeName: exe })
        li.remove()
        if (!list.children.length) wrap.hidden = true
        refresh()
      } catch (err) {
        remove.disabled = false
        remove.textContent = 'Remove'
        const msg = el('link-msg')
        msg.textContent = String(err)
        msg.className = 'panel-msg bad'
        msg.hidden = false
      }
    })

    li.append(label, remove)
    list.appendChild(li)
  }
}

/** The debounce timer for the search box, so fast typing fires one request. */
let searchDebounce = null
/** The program "Add a new game" was opened for, if any — linked on success. */
let searchExe = null

function renderSearchResults(results) {
  const list = el('search-results')
  list.innerHTML = ''
  el('search-empty').hidden = results.length > 0

  for (const game of results) {
    const li = document.createElement('li')

    const thumb = game.cover_image ?? game.background_image
    if (thumb) {
      const img = document.createElement('img')
      img.src = thumb
      img.alt = ''
      li.appendChild(img)
    }

    const label = document.createElement('span')
    label.className = 'game-title'
    label.textContent = game.released ? `${game.name} (${game.released.slice(0, 4)})` : game.name

    const add = document.createElement('button')
    add.className = 'search-add'
    add.textContent = 'Add'
    add.addEventListener('click', async () => {
      add.disabled = true
      add.textContent = 'Adding…'
      try {
        const response = await invoke('add_searched_game', { igdbId: game.id, title: game.name })
        el('search-panel').hidden = true
        // Back to the link panel with this game ready to go — "Link them" is
        // the one explicit step that actually starts tracking, same as any
        // other game picked there. Added directly as an option rather than
        // waiting on the next background state refresh to surface it: that
        // poll can be up to ten seconds away, during which the dropdown would
        // show no sign the add just worked.
        await openLinkPanel(searchExe)
        const gameSelect = el('link-game')
        if (response.gameId && !Array.from(gameSelect.options).some(o => o.value === response.gameId)) {
          const opt = document.createElement('option')
          opt.value = response.gameId
          opt.textContent = response.title || game.name
          gameSelect.appendChild(opt)
        }
        if (response.gameId) {
          gameSelect.value = response.gameId
          gameSelect.dispatchEvent(new Event('change'))
        }
      } catch (err) {
        add.disabled = false
        add.textContent = 'Add'
        const msg = el('search-error')
        msg.textContent = String(err)
        msg.hidden = false
      }
    })

    li.append(label, add)
    list.appendChild(li)
  }
}

async function runSearch(query) {
  // Mirrors the website's own add-game box: nothing under two characters is
  // worth a request, since the results would be too broad to mean anything.
  if (!query || query.trim().length < 2) {
    renderSearchResults([])
    return
  }
  const results = await invoke('search_games', { query: query.trim() }).catch(() => [])
  renderSearchResults(results)
}

/**
 * Open the search panel in place of the link panel — a real search of the
 * game database, native, rather than opening the website. `initialQuery` is
 * only a starting point (from `guessTitleFromExe`), never trusted as the
 * answer the way it used to be when this opened a pre-filled website form.
 */
function openSearchPanel(exe, initialQuery) {
  searchExe = exe || null
  el('link-panel').hidden = true
  el('search-error').hidden = true
  el('search-empty').hidden = true
  el('search-results').innerHTML = ''
  const input = el('search-query')
  input.value = initialQuery || ''
  el('search-panel').hidden = false
  input.focus()
  runSearch(input.value)
}

el('search-query').addEventListener('input', () => {
  clearTimeout(searchDebounce)
  const query = el('search-query').value
  searchDebounce = setTimeout(() => runSearch(query), 300)
})

el('search-cancel').addEventListener('click', () => { el('search-panel').hidden = true })

// Wrapped, not passed directly: a listener is called with the click event, and
// openLinkPanel would take that object as the program to preselect — putting
// "[object PointerEvent]" at the top of the picker and skipping the suggestion.
el('btn-link').addEventListener('click', () => openLinkPanel())
el('link-exe').addEventListener('change', showExeWarning)

/**
 * Picking a game selects the program that looks like it.
 *
 * Rust does the matching, so the app and the "is this your game?" prompt agree
 * on what counts as a match. Only applied when it is confident — a wrong
 * preselection is worse than none, because the user has to notice it before
 * correcting it.
 */
el('link-game').addEventListener('change', async () => {
  const option = el('link-game').selectedOptions[0]
  if (!option || !option.value) return // the "— Select a game —" placeholder
  // The game it already has, if it has one — never defaults the dropdown
  // away from a real value just because this game happens to list last.
  const game = lastLinkPlaying.find(g => g.id === option.value)
  if (game?.platform) populatePlatformSelect(el('link-platform'), game.platform)

  const title = option.textContent.replace(' (already linked)', '')
  const exe = await invoke('suggest_program', { title }).catch(() => null)
  if (exe) {
    el('link-exe').value = exe
    showExeWarning()
  }
})
/**
 * A rough title from an executable name, for the add-game search box to start
 * from — not a claim about what the game actually is, just something closer
 * to typing than a blank field. "split_fiction-Win64-Shipping.exe" becomes
 * "Split Fiction".
 */
function guessTitleFromExe(exe) {
  const base = (exe || '').replace(/\.exe$/i, '')
  const noise = /^(win64|win32|x64|x86|shipping|retail|launcher)$/i
  const words = base
    .split(/[\s_.\-]+/)
    // Noise is filtered as a whole separator-delimited part — "Win64" as one
    // chunk — before any further splitting, or the later digit/case split
    // would break it into "Win" + "64" and neither matches the noise list.
    .filter(part => part && !noise.test(part))
    .flatMap(part => part.split(/(?=[A-Z][a-z])|(?<=[a-z0-9])(?=[A-Z])|(?<=[a-zA-Z])(?=\d)/))
    .filter(Boolean)
  if (words.length === 0) return ''
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

el('link-add-new').addEventListener('click', () => {
  const exe = el('link-exe').value
  openSearchPanel(exe, guessTitleFromExe(exe))
})

el('link-cancel').addEventListener('click', () => { el('link-panel').hidden = true })

el('link-save').addEventListener('click', async () => {
  const exe = el('link-exe').value
  const gameId = el('link-game').value
  const msg = el('link-msg')
  if (!exe || !gameId) {
    msg.textContent = 'Pick a program and a game.'
    msg.className = 'panel-msg bad'
    msg.hidden = false
    return
  }
  const platform = el('link-platform').value
  const currentPlatform = lastLinkPlaying.find(g => g.id === gameId)?.platform ?? null
  el('link-save').disabled = true
  try {
    await invoke('link_executable', { exeName: exe, gameId, platform, currentPlatform })
    msg.textContent = `Linked. ${exe} will be tracked from now on.`
    msg.className = 'panel-msg ok'
    msg.hidden = false
    setTimeout(() => { el('link-panel').hidden = true }, 1800)
    refresh()
  } catch (err) {
    msg.textContent = String(err)
    msg.className = 'panel-msg bad'
    msg.hidden = false
  } finally {
    el('link-save').disabled = false
  }
})

el('prompt-yes').addEventListener('click', async () => {
  if (!currentPrompt) return
  const { confident, exe_name: exe } = currentPrompt

  if (confident) {
    // "Yes, that is the game" — link it and get out of the way.
    el('prompt-yes').disabled = true
    try {
      await invoke('confirm_prompt')
    } catch {
      // Linking is a request to the site, so it can fail — say so rather
      // than closing as though it had worked (the prompt is still pending
      // server-side either way).
      el('prompt-yes').disabled = false
      el('prompt-error').textContent = 'Could not reach GamesList. Try again.'
      el('prompt-error').hidden = false
      return
    }
    refresh()
    return
  }

  // "Pick it" — not remembered: they have said it *is* a game, so if they
  // wander off without linking it, asking again is right. Stays in this
  // window rather than opening the website's link page in a second one.
  await invoke('dismiss_prompt', { remember: false })
  await openLinkPanel(exe || null)
  refresh()
})
el('prompt-no').addEventListener('click', async () => {
  if (!currentPrompt) return
  // "No" / "Not a game" is the one answer that means never ask about this
  // program again.
  await invoke('dismiss_prompt', { remember: true })
  refresh()
})

// ── Keep it current ─────────────────────────────────────────────────────────
// Rust emits this whenever something actually changes; the interval is only so
// the elapsed time ticks over while a game is running.
listen('status-changed', refresh)

// The toast's "Pick it": it knows the program but not the game, so it sends
// the user here with that program already chosen.
listen('open-link-panel', event => openLinkPanel(event.payload || null))

/**
 * Coming back to this window usually means something was just done elsewhere:
 * pairing finished, or a game was linked on the website. Neither is something
 * the app can observe, so ask the watcher to re-read the server, then show the
 * result when it lands.
 */
async function refreshFromServer() {
  try { await invoke('refresh_state') } catch { /* not paired yet */ }
  refresh()
}

window.addEventListener('focus', refreshFromServer)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshFromServer()
})
// The clock ticks locally every second; the full status re-read stays slow,
// since Rust emits an event whenever something actually changes.
setInterval(tickElapsed, 1000)
setInterval(refresh, 30_000)
refresh()
