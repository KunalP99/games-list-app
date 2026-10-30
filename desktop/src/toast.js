// The "is this your game?" toast.
//
// Asked here rather than only on the status screen because the question fires
// the moment a game launches, which is exactly when nobody wants to go looking
// for an app window. Everything the toast knows comes from `get_status`, the
// same payload the status screen reads.

import { applyTheme } from './theme.js'

const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event

const el = (id) => document.getElementById(id)

/** How long the "you can link it later" note stays before the toast goes. */
const ACKNOWLEDGEMENT_MS = 6000

/** The prompt being shown, so the buttons know what they are answering. */
let current = null

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
}

async function load() {
  const status = await invoke('get_status').catch(() => null)
  applyTheme(status ?? {})

  if (!status?.pending_prompt) {
    // Answered elsewhere between the window opening and this running.
    close()
    return
  }
  render(status.pending_prompt)

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

// Answered on the status screen instead, or the watcher dropped the prompt:
// either way there is nothing left to ask.
listen('status-changed', async () => {
  if (answered) return
  const status = await invoke('get_status').catch(() => null)
  if (!status?.pending_prompt) {
    close()
    return
  }
  applyTheme(status)
  if (status.pending_prompt.exe_name !== current?.exe_name) render(status.pending_prompt)
})

load()
