import { spawn } from 'node:child_process'
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { open, readFile } from 'node:fs/promises'

interface ProcessOptions {
  cwd: string
  log: string
  signal?: AbortSignal
  measure?: boolean
  timeoutMs?: number
  /** Global private-state fence shared with the runner store, not a per-run path. */
  fencePath?: string
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

function readFence(path: string): { token: string; ownerPid: number; pgid: number | null } | undefined {
  try {
    if (!lstatSync(path).isFile()) throw new Error('Invalid worker fence')
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof value.token !== 'string' || !Number.isSafeInteger(value.ownerPid) || value.ownerPid <= 0
      || (value.pgid !== null && (!Number.isSafeInteger(value.pgid) || value.pgid <= 0))) throw new Error('Invalid worker fence')
    return value
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

function reserveFence(path: string, token: string): void {
  const existing = readFence(path)
  if (existing) {
    if (alive(existing.ownerPid) || (existing.pgid !== null && alive(-existing.pgid))) throw new Error('A native worker may still be running')
    // Caller holds the global runner ownership; only a confirmed-dead fence can be replaced.
    unlinkSync(path)
  }
  writeFileSync(path, JSON.stringify({ token, ownerPid: process.pid, pgid: null }), { flag: 'wx', mode: 0o600 })
}

function flush(path: string): void {
  const fd = openSync(path, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}

/** Adapter argv is never interpolated. A fixed shell gate prevents inference before durable group publication. */
export async function runProcess(command: string[], options: ProcessOptions) {
  options.signal?.throwIfAborted()
  const handle = await open(options.log, 'ax', 0o600)
  const token = crypto.randomUUID()
  const measured = options.measure && process.platform === 'darwin'
  const argv = measured ? ['/usr/bin/time', '-l', ...command] : command
  const started = performance.now()
  let fenced = false
  let child: ReturnType<typeof spawn> | undefined
  let cancelled = false
  let timedOut = false
  let stopping: Promise<void> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const groupAlive = () => !!child?.pid && alive(-child.pid)
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child?.pid) return
    try { process.kill(-child.pid, signal) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25))
  // Launcher exit is not group exit: descendants inherit file descriptors, not Node-managed pipes.
  const terminate = () => stopping ??= (async () => {
    signalGroup('SIGTERM')
    const deadline = performance.now() + 3000
    while (groupAlive() && performance.now() < deadline) await pause()
    if (groupAlive()) signalGroup('SIGKILL')
    const killedDeadline = performance.now() + 5000
    while (groupAlive() && performance.now() < killedDeadline) await pause()
    if (groupAlive()) throw new Error('Native process group is still live; worker fence retained')
  })()
  const onAbort = () => { cancelled = true; void terminate().catch(() => {}) }
  try {
    options.signal?.throwIfAborted()
    if (options.fencePath) { reserveFence(options.fencePath, token); fenced = true }
    // EOF on parent death closes the gate without executing the native command.
    child = spawn('/bin/sh', ['-c', 'IFS= read -r gate && [ "$gate" = GO ] || exit 125; exec "$@"', 'studio-worker', ...argv], {
      cwd: options.cwd, detached: true, shell: false,
      stdio: ['pipe', handle.fd, handle.fd],
      env: { ...process.env, PYANNOTE_METRICS_ENABLED: '0', HF_HUB_DISABLE_TELEMETRY: '1' },
    })
    const exited = new Promise<void>((resolve, reject) => {
      child!.once('error', reject)
      child!.once('close', code => code === 0 ? resolve() : reject(new Error(`Worker exited with code ${code}; see private run log`)))
    })
    // A publication failure must not leave a rejected child promise unobserved during cleanup.
    void exited.catch(() => {})
    child.stdin?.on('error', () => {}) // Spawn failure/early exit can close the gate before its write.
    if (options.fencePath && child.pid) {
      const temporary = `${options.fencePath}.${token}.tmp`
      writeFileSync(temporary, JSON.stringify({ token, ownerPid: process.pid, pgid: child.pid }), { flag: 'wx', mode: 0o600 })
      flush(temporary)
      renameSync(temporary, options.fencePath)
      flush(dirname(options.fencePath))
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
    child.stdin?.end(cancelled ? '' : 'GO\n')
    timeout = setTimeout(() => { timedOut = true; void terminate().catch(() => {}) }, options.timeoutMs ?? 3_600_000)
    try { await exited }
    catch (error) { if (!cancelled && !timedOut) throw error }
    if (stopping) await stopping
    if (cancelled) throw new Error('Run cancelled')
    if (timedOut) throw new Error('Worker timed out')
    // Even a successful launcher must not leave unaccounted descendants behind.
    if (groupAlive()) { await terminate(); throw new Error('Worker exited with live descendants') }
    const log = await readFile(options.log, 'utf8')
    const memory = log.match(/(\d+)\s+maximum resident set size/)
    return { wallSeconds: (performance.now() - started) / 1000, peakMemoryBytes: memory ? Number(memory[1]) : undefined }
  }
  finally {
    if (timeout) clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
    try {
      if (groupAlive() || stopping) await terminate()
    }
    finally {
      // An unkillable/unknown group deliberately keeps admission fenced off for manual review.
      if (fenced && !groupAlive() && options.fencePath && readFence(options.fencePath)?.token === token) unlinkSync(options.fencePath)
      await handle.close()
    }
  }
}
