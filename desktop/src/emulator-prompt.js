// The emulator question: "Playing Okami in PCSX2?" (one exact match, not in
// the library) or "Which game are you playing in PCSX2?" (up to three to
// pick from). Shared by the toast and the status screen, so the two can't
// drift apart. Answers go to `respond_to_emulator_prompt`, and the site
// remembers them, so the same game is never asked about twice.

const { invoke } = window.__TAURI__.core

function year(released) {
  return released ? ` (${String(released).slice(0, 4)})` : ''
}

function button(label, className, onClick) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

/**
 * Fills `root` with the question for `prompt` (a `pending_emulator_prompt`).
 * `onAnswered` runs once the answer is in; `onAnswering` just before it's
 * sent (the toast uses it to stop re-rendering under the click).
 */
export function renderEmulatorPrompt(root, prompt, { onAnswering = () => {}, onAnswered = () => {} } = {}) {
  root.replaceChildren()

  const heading = document.createElement('p')
  heading.className = 'toast-heading'
  const help = document.createElement('p')
  help.className = 'prompt-question emu-help'
  const error = document.createElement('p')
  error.className = 'toast-error'
  error.hidden = true

  const buttons = []
  async function answer(args) {
    onAnswering()
    error.hidden = true
    buttons.forEach(b => { b.disabled = true })
    try {
      await invoke('respond_to_emulator_prompt', args)
      onAnswered()
    } catch (err) {
      buttons.forEach(b => { b.disabled = false })
      error.textContent = `Could not reach GamesList: ${err}`
      error.hidden = false
    }
  }
  const notNow = button('Not now', 'ghost', () => answer({}))

  if (prompt.kind === 'add') {
    const game = prompt.candidates[0]
    heading.append('Playing ', Object.assign(document.createElement('strong'), { textContent: game.name }), ` in ${prompt.emulator}?`)
    help.textContent = 'Track it and it’s added to your games as Playing, marked Emulated.'
    const track = button('Track it', 'primary', () => answer({ igdbId: game.igdbId, title: game.name }))
    const wrong = button('Not this game', 'ghost', () => answer({ none: true }))
    wrong.title = 'Never ask about this game again'
    buttons.push(track, notNow, wrong)
    const actions = document.createElement('div')
    actions.className = 'prompt-actions'
    actions.append(track, notNow, wrong)
    root.append(heading, help, actions, error)
    return
  }

  heading.textContent = `Which game are you playing in ${prompt.emulator}?`
  help.textContent = `It shows as “${prompt.label}”.`
  const options = document.createElement('div')
  options.className = 'emu-options'
  for (const game of prompt.candidates) {
    const b = button(game.name + year(game.released), 'ghost emu-option', () => answer({ igdbId: game.igdbId, title: game.name }))
    buttons.push(b)
    options.append(b)
  }
  const none = button('None of these', 'ghost', () => answer({ none: true }))
  none.title = 'Never ask about this game again'
  buttons.push(none, notNow)
  const actions = document.createElement('div')
  actions.className = 'prompt-actions'
  actions.append(none, notNow)
  root.append(heading, help, options, actions, error)
}
