// Runs the e2e suite against both editions, one after the other, then puts
// everything back how it was.
//
//   npm run test:e2e:both                  # every spec, both editions
//   npm run test:e2e:both -- e2e/games.spec.ts   # extra args go to Playwright
//
// Only ever switches between the two LOCAL environments (env:dev and
// env:dev-public, which share the local test database). If .env.local points
// anywhere else (production, the real public project), it refuses and changes
// nothing. It starts with the edition you're on, switches to the other,
// restarts the dev server for each, and at the end switches back and restores
// your dev server (or stops it, if you weren't running one).
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, spawnSync } from 'child_process'

const ROOT = process.cwd()
const URL = 'http://localhost:3000/login'
const LOCAL = ['dev', 'dev-public']
const isWindows = process.platform === 'win32'
const passthrough = process.argv.slice(2)

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, shell: isWindows, encoding: 'utf8', ...opts })
}

/** "dev" / "dev-public" / something else, from `npm run env`'s "Active: X" line. */
function activeEnv() {
  const out = run('node', ['scripts/use-env.mjs']).stdout ?? ''
  const m = out.match(/^Active:\s+(\S+)/m)
  return m ? m[1].toLowerCase() : null
}

function switchTo(env) {
  const r = run('node', ['scripts/use-env.mjs', env])
  if (r.status !== 0) throw new Error(`Couldn't switch to ${env}:\n${r.stdout}${r.stderr}`)
  console.log(`  .env.local → ${env}`)
}

function stopDevServer() {
  if (isWindows) run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/kill-dev-servers.ps1'])
  else run('pkill', ['-f', 'next dev'])
}

async function serverHtml() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(5_000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** Starts `npm run dev` in the background (it outlives this script); its output goes to a log file. */
function startDevServer(label) {
  const log = path.join(os.tmpdir(), `gameslist-dev-${label}.log`)
  const out = fs.openSync(log, 'w')
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, shell: isWindows, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  return log
}

/** Waits until the dev server answers, serving the expected edition. */
async function waitForEdition(env) {
  const wantPublic = env === 'dev-public'
  for (let i = 0; i < 90; i++) {
    const html = await serverHtml()
    if (html && html.includes('TEST DATABASE') && html.includes('PUBLIC EDITION') === wantPublic) return
    await new Promise(r => setTimeout(r, 2_000))
  }
  throw new Error(`The dev server didn't come up as ${env} within 3 minutes.`)
}

function runSuite(env) {
  const report = path.join(os.tmpdir(), `gameslist-e2e-${env}.json`)
  fs.rmSync(report, { force: true })
  const r = spawnSync('npx', ['playwright', 'test', '--reporter=list,json', ...passthrough], {
    cwd: ROOT, shell: isWindows, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
  })
  let stats = null
  try { stats = JSON.parse(fs.readFileSync(report, 'utf8')).stats } catch { /* the run itself failed to start */ }
  return { env, ok: r.status === 0, stats }
}

const original = activeEnv()
if (!LOCAL.includes(original)) {
  console.error(`\n.env.local is on "${original ?? 'unknown'}", not one of the local test environments (${LOCAL.join(', ')}).`)
  console.error('This only ever switches between those two; switch to one of them first (npm run env:dev).\n')
  process.exit(1)
}
const wasRunning = (await serverHtml()) != null
const order = [original, ...LOCAL.filter(e => e !== original)]
const results = []

try {
  for (const env of order) {
    console.log(`\n━━ ${env === 'dev-public' ? 'PUBLIC' : 'FRIENDS'} edition (${env}) ━━`)
    if (activeEnv() !== env) switchTo(env)
    stopDevServer()
    const log = startDevServer(env)
    console.log(`  dev server starting (log: ${log})`)
    await waitForEdition(env)
    console.log('  dev server ready\n')
    results.push(runSuite(env))
  }
} catch (err) {
  console.error(`\n${err.message}`)
  results.push({ env: 'setup', ok: false, stats: null })
} finally {
  console.log('\n━━ Restoring ━━')
  try {
    if (activeEnv() !== original) switchTo(original)
    stopDevServer()
    if (wasRunning) {
      const log = startDevServer(original)
      await waitForEdition(original)
      console.log(`  your dev server is back on ${original} (running in the background; log: ${log})`)
    } else {
      console.log('  dev server stopped (none was running before)')
    }
  } catch (err) {
    console.error(`  Couldn't fully restore: ${err.message}\n  Check with: npm run env`)
  }
}

console.log('\n━━ Summary ━━')
for (const r of results) {
  const s = r.stats
  const detail = s ? `${s.expected} passed, ${s.unexpected} failed, ${s.flaky} flaky, ${s.skipped} skipped` : 'did not run'
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.env.padEnd(10)} ${detail}`)
}
process.exit(results.length === LOCAL.length && results.every(r => r.ok) ? 0 : 1)
