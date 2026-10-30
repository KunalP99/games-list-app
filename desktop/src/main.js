// Status screen logic.
//
// Everything here is read-only reporting plus a few buttons; all the real work
// (watching, timing, sending) happens in Rust. The window can be closed at any
// point without stopping anything.

const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event

const el = (id) => document.getElementById(id)

/** Paint the app in the user's accent, from the palette the site computed. */
function applyTheme(status) {
  const root = document.documentElement
  for (const [stop, rgb] of Object.entries(status.palette ?? {})) {
    root.style.setProperty(`--brand-${stop}`, rgb.join(' '))
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = status.theme === 'system' ? (prefersDark ? 'dark' : 'light') : status.theme
  root.setAttribute('data-theme', theme)
}

function formatElapsed(minutes) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
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
  if (tracking) el('status-elapsed').textContent = formatElapsed(tracking.minutes)

  renderPlaying(status.playing ?? [])
  renderPrompt(status.pending_prompt)
  el('sync-line').textContent = formatSync(status.last_sync, status.queued, status.last_error)
}

// ── Buttons ─────────────────────────────────────────────────────────────────
el('btn-connect').addEventListener('click', () => invoke('start_pairing'))
el('btn-games').addEventListener('click', () => invoke('open_site', { path: '/games' }))
el('btn-settings').addEventListener('click', () => invoke('open_site', { path: '/settings' }))
el('btn-link').addEventListener('click', () =>
  invoke('open_site', { path: '/settings/devices/link' }))

el('prompt-yes').addEventListener('click', async () => {
  await invoke('confirm_prompt')
  refresh()
})
el('prompt-no').addEventListener('click', async () => {
  const exe = el('prompt-card').dataset.exe ?? ''
  await invoke('dismiss_prompt')
  await invoke('open_site', { path: `/settings/devices/link?exe=${encodeURIComponent(exe)}` })
  refresh()
})

// ── Keep it current ─────────────────────────────────────────────────────────
// Rust emits this whenever something actually changes; the interval is only so
// the elapsed time ticks over while a game is running.
listen('status-changed', refresh)
setInterval(refresh, 30_000)
refresh()
