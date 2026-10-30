// Status screen logic.
//
// Everything here is read-only reporting plus a few buttons; all the real work
// (watching, timing, sending) happens in Rust. The window can be closed at any
// point without stopping anything.

import { applyTheme } from './theme.js'

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
    pill.textContent = game.linked ? 'Ready' : 'Not linked'

    li.append(title, hours, pill)
    list.appendChild(li)
  }
}

function renderPrompt(prompt) {
  const card = el('prompt-card')
  if (!prompt) {
    card.hidden = true
    return
  }
  card.hidden = false
  el('prompt-exe').textContent = prompt.exe_name
  el('prompt-title').textContent = prompt.suggested_title
  card.dataset.exe = prompt.exe_name
}

let startedAtMs = null

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

  applyTheme(status)

  el('signed-out').hidden = status.paired
  el('signed-in').hidden = !status.paired
  el('who').textContent = status.paired
    ? (status.display_name ?? 'Signed in')
    : 'Not connected'

  if (!status.paired) return

  const tracking = status.tracking
  el('status-dot').classList.toggle('live', Boolean(tracking))
  el('status-label').textContent = tracking ? 'Tracking' : 'Not tracking'
  el('status-game').textContent = tracking
    ? tracking.title
    : 'Start a game you’ve set to Playing.'
  el('status-elapsed').hidden = !tracking

  // Keep the server's start time, not a local counter: the window can be
  // closed and reopened mid-session, and a local counter would restart at zero.
  startedAtMs = tracking ? Date.parse(tracking.started_at) : null
  tickElapsed()

  renderPlaying(status.playing ?? [])
  renderPrompt(status.pending_prompt)
  el('sync-line').textContent = formatSync(status.last_sync, status.queued, status.last_error)
}

// ── Buttons ─────────────────────────────────────────────────────────────────
el('btn-connect').addEventListener('click', () => invoke('start_pairing'))
el('btn-games').addEventListener('click', () => invoke('open_site', { path: '/games' }))
el('btn-settings').addEventListener('click', () => invoke('open_site', { path: '/settings' }))
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
  for (const game of status?.playing ?? []) {
    const opt = document.createElement('option')
    opt.value = game.id
    opt.textContent = game.linked ? `${game.title} (already linked)` : game.title
    gameSelect.appendChild(opt)
  }

  renderLinked(status)
  // No program picked for us? Offer the one that looks like the game
  // that is already selected.
  if (!preselectExe) el('link-game').dispatchEvent(new Event('change'))
  showExeWarning()
  panel.hidden = false
}

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
  if (!option) return
  const title = option.textContent.replace(' (already linked)', '')
  const exe = await invoke('suggest_program', { title }).catch(() => null)
  if (exe) {
    el('link-exe').value = exe
    showExeWarning()
  }
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
  el('link-save').disabled = true
  try {
    await invoke('link_executable', { exeName: exe, gameId })
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
  await invoke('confirm_prompt')
  refresh()
})
el('prompt-no').addEventListener('click', async () => {
  // Stay in this window: opening the website's link page in a second window
  // was the one part of this flow that could show up blank.
  const exe = el('prompt-card').dataset.exe ?? ''
  await invoke('dismiss_prompt')
  await openLinkPanel(exe || null)
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
