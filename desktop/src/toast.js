// The "is this your game?" toast.
//
// Asked here rather than only on the status screen because the question fires
// the moment a game launches, which is exactly when nobody wants to go looking
// for an app window. Everything the toast knows comes from `get_status`, the
// same payload the status screen reads.

import { applyTheme } from './theme.js'
import { populatePlatformSelect } from './platforms.js'

const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event

const el = (id) => document.getElementById(id)

/** How long the "you can link it later" note stays before the toast goes. */
const ACKNOWLEDGEMENT_MS = 6000

/** The prompt being shown, so the buttons know what they are answering. */
let current = null
/** The platform-confirm prompt being shown, if that's what this toast is for. */
let currentPlatform = null
/** The resume/replay prompt being shown, if that's what this toast is for. */
let currentResume = null

/**
 * True once answered.
 *
 * The toast closes itself when the prompt goes away — that is what tidies it
 * up when the question is answered on the status screen instead. But answering
 * *here* also clears the prompt, and then that rule would snatch away the note
 * explaining what happens next, so after an answer it no longer applies.
 */
let answered = false

function close() {
  invoke('close_toast').catch(() => {})
}

// The × button: only the window goes away. `pending_prompt` is untouched, so
// the same question is still sitting on the status screen for anyone who
// closed this by mistake and actually meant to answer it. `dismiss_toast`
// records that this was a real × though — without it the watcher cannot tell
// a waved-away toast from one that vanished for any other reason, and so
// never put either back.
el('ask-dismiss').addEventListener('click', async () => {
  await invoke('dismiss_toast').catch(() => {})
  close()
})

function render(prompt) {
  current = prompt
  el('ask-exe').textContent = prompt.exe_name

  if (prompt.confident) {
    // The name resembles a game in the Playing list, so name it: one click
    // and it is linked.
    el('ask-heading').textContent = 'Is this your game?'
    el('ask-title').textContent = prompt.suggested_title
    el('ask-named').hidden = false
    el('ask-help').hidden = true
    el('ask-yes').textContent = 'Yes'
    el('ask-no').textContent = 'No'
  } else {
    // Nothing resembled it. It still looks like a game, so ask — but asking
    // "is this Hollow Knight?" about a name that is nothing like it would be
    // wrong far more often than right.
    el('ask-heading').textContent = 'Is this a game?'
    el('ask-named').hidden = true
    el('ask-help').hidden = false
    el('ask-yes').textContent = 'Pick it'
    el('ask-no').textContent = 'Not a game'
  }

  el('ask').hidden = false
  el('said-no').hidden = true
  el('platform-ask').hidden = true
  el('resume-ask').hidden = true
}

/** Mirrors renderPlatformPrompt in main.js — see there for why the three
 *  prompts here never overlap. */
function renderPlatform(prompt) {
  currentPlatform = prompt
  el('platform-ask-title').textContent = prompt.title
  el('platform-ask-error').hidden = true
  populatePlatformSelect(el('platform-ask-select'), prompt.current_platform)
  el('ask').hidden = true
  el('said-no').hidden = true
  el('platform-ask').hidden = false
  el('resume-ask').hidden = true
}

/** Mirrors renderResumePrompt in main.js. */
function renderResume(prompt) {
  currentResume = prompt
  el('resume-ask-error').hidden = true
  const ambientButton = el('resume-ask-ambient')
  if (prompt.kind === 'dnf') {
    el('resume-ask-heading').textContent = `You dropped ${prompt.title} before — are you resuming it?`
    el('resume-ask-yes').textContent = 'Resume'
    ambientButton.hidden = true
  } else if (prompt.kind === 'backlog') {
    el('resume-ask-heading').textContent = `You have ${prompt.title} in your backlog — set it to:`
    el('resume-ask-yes').textContent = 'Set to Playing'
    ambientButton.hidden = false
  } else {
    el('resume-ask-heading').textContent = `You already completed ${prompt.title} — is this a replay?`
    el('resume-ask-yes').textContent = 'Yes, replay'
    ambientButton.hidden = true
  }
  el('ask').hidden = true
  el('said-no').hidden = true
  el('platform-ask').hidden = true
  el('resume-ask').hidden = false
}

async function load() {
  const status = await invoke('get_status').catch(() => null)
  applyTheme(status ?? {})

  if (status?.pending_prompt) {
    render(status.pending_prompt)
  } else if (status?.pending_platform_prompt) {
    renderPlatform(status.pending_platform_prompt)
  } else if (status?.pending_resume_prompt) {
    renderResume(status.pending_resume_prompt)
  } else {
    // Answered elsewhere between the window opening and this running.
    close()
    return
  }

  // Built hidden, so nothing can appear as a white box over a game: this is
  // what puts it on screen, once there is something to see.
  invoke('toast_ready').catch(() => {})
}

el('ask-yes').addEventListener('click', async () => {
  if (!current) return
  answered = true
  const confident = current.confident
  const exe = current.exe_name

  if (confident) {
    // "Yes, that is the game" — link it and get out of the way. Tracking
    // starts on the watcher's next tick.
    el('ask-yes').disabled = true
    try {
      await invoke('confirm_prompt')
    } catch {
      // Linking is a request to the site, so it can fail — the laptop is
      // offline, the site is down. Closing here would look exactly like
      // success and quietly lose the hours. The prompt is still pending
      // server-side, so the question stays answerable.
      answered = false
      el('ask-yes').disabled = false
      el('ask-error').textContent = 'Could not reach GamesList. Try again, or link it in the app.'
      el('ask-error').hidden = false
      return
    }
    close()
    return
  }

  // "Pick it" — the app's link panel is the place to choose a game, with this
  // program already selected. Not remembered: they have said it *is* a game,
  // so if they wander off without linking it, asking again is right.
  await invoke('dismiss_prompt', { remember: false }).catch(() => {})
  await invoke('open_app', { linkExe: exe }).catch(() => {})
  close()
})

el('ask-no').addEventListener('click', async () => {
  if (!current) return
  answered = true
  const confident = current.confident
  const exe = current.exe_name
  // "No" / "Not a game" is the one answer that means never ask about this
  // program again.
  await invoke('dismiss_prompt', { remember: true }).catch(() => {})

  if (!confident) {
    // They have said there is nothing to link, so offering to link it later
    // would be the wrong thing to say.
    close()
    return
  }

  el('no-exe').textContent = exe
  el('ask').hidden = true
  el('said-no').hidden = false
  setTimeout(close, ACKNOWLEDGEMENT_MS)
})

el('no-open').addEventListener('click', async () => {
  await invoke('open_app', {}).catch(() => {})
  close()
})

el('platform-ask-save').addEventListener('click', async () => {
  if (!currentPlatform) return
  answered = true
  const platform = el('platform-ask-select').value
  el('platform-ask-save').disabled = true
  try {
    await invoke('set_platform', { platform })
  } catch (err) {
    answered = false
    el('platform-ask-save').disabled = false
    el('platform-ask-error').textContent = String(err)
    el('platform-ask-error').hidden = false
    return
  }
  close()
})

el('resume-ask-yes').addEventListener('click', async () => {
  if (!currentResume) return
  answered = true
  el('resume-ask-yes').disabled = true
  try {
    const status = currentResume.kind === 'backlog' ? 'playing' : undefined
    await invoke('respond_to_resume_prompt', { accept: true, status })
  } catch (err) {
    answered = false
    el('resume-ask-yes').disabled = false
    el('resume-ask-error').textContent = String(err)
    el('resume-ask-error').hidden = false
    return
  }
  close()
})
el('resume-ask-ambient').addEventListener('click', async () => {
  if (!currentResume) return
  answered = true
  el('resume-ask-ambient').disabled = true
  try {
    await invoke('respond_to_resume_prompt', { accept: true, status: 'ambient' })
  } catch (err) {
    answered = false
    el('resume-ask-ambient').disabled = false
    el('resume-ask-error').textContent = String(err)
    el('resume-ask-error').hidden = false
    return
  }
  close()
})
el('resume-ask-no').addEventListener('click', async () => {
  if (!currentResume) return
  answered = true
  await invoke('respond_to_resume_prompt', { accept: false }).catch(() => {})
  close()
})

// Answered on the status screen instead, or the watcher dropped the prompt:
// either way there is nothing left to ask.
listen('status-changed', async () => {
  if (answered) return
  const status = await invoke('get_status').catch(() => null)
  if (status?.pending_prompt) {
    applyTheme(status)
    if (status.pending_prompt.exe_name !== current?.exe_name) render(status.pending_prompt)
    return
  }
  if (status?.pending_platform_prompt) {
    applyTheme(status)
    if (status.pending_platform_prompt.game_id !== currentPlatform?.game_id) renderPlatform(status.pending_platform_prompt)
    return
  }
  if (status?.pending_resume_prompt) {
    applyTheme(status)
    if (status.pending_resume_prompt.game_id !== currentResume?.game_id) renderResume(status.pending_resume_prompt)
    return
  }
  close()
})

load()
