import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: transcribe [--headless | --browser]\n\nStarts the local Whisper transcription app. Reuses an existing instance.\n--headless, -s   Start without opening a browser.\n--browser, -b    Open the browser (default).')
  process.exit(0)
}
if (args.some(arg => !['--headless', '-s', '--browser', '-b'].includes(arg))) {
  console.error('Unknown option. Run transcribe --help.')
  process.exit(2)
}
const headless = args.includes('--headless') || args.includes('-s')
const directory = fileURLToPath(new URL('..', import.meta.url))
const url = 'http://localhost:42076'

async function isTranscribe(): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/app-info`, { signal: AbortSignal.timeout(1000), redirect: 'error' })
    return response.ok && (await response.json()).application === 'local-transcribe'
  }
  catch { return false }
}

function openBrowser() {
  if (headless) return
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const child = spawn(command, [url], { stdio: 'ignore' })
  child.on('error', () => console.error(`Open ${url} in your browser.`))
  child.unref()
}

if (await isTranscribe()) {
  console.log(`Transcribe is already running at ${url}`)
  openBrowser()
  process.exit(0)
}
if (!existsSync(fileURLToPath(new URL('../node_modules', import.meta.url)))) {
  console.error('Dependencies are missing. Run the repository\'s bin/install first.')
  process.exit(1)
}

// Fail clearly on a foreign listener instead of letting Nuxt select a public/different port.
await new Promise<void>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', () => reject(new Error(`Port 42076 is occupied by another service. Stop it before running transcribe.`)))
  probe.listen(42076, 'localhost', () => probe.close(error => error ? reject(error) : resolve()))
})
const child = spawn(process.execPath, ['run', 'dev'], { cwd: directory, stdio: 'inherit' })
const exited = new Promise<number>((resolve) => {
  child.once('error', () => resolve(1))
  child.once('exit', code => resolve(code ?? 1))
})
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; child.kill(signal) })
}
const readiness = (async () => {
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    if (await isTranscribe()) { console.log(`Transcribe: ${url}`); openBrowser(); return }
    await Bun.sleep(500)
  }
  if (!stopping) { console.error('Transcribe did not become ready within 60 seconds.'); child.kill('SIGTERM') }
})()
await Promise.race([readiness, exited])
process.exit(await exited)
