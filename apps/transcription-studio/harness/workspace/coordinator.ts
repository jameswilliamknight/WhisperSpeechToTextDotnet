import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RunLease } from '../runs/store'
import type { JobRecord } from './store'

export class CoordinatorOwnershipError extends Error {
  constructor() { super('Coordinator startup is uncertain; native admission remains fenced') }
}

/** Nuxt dev reloads destroy request workers and their ChildProcess listeners.
 * A checkout-owned Bun coordinator keeps process reaping/finalisation outside
 * that lifecycle. A stdin gate forbids inference before durable lease transfer. */
export async function launchCoordinator(record: JobRecord, lease: RunLease): Promise<void> {
  const log = await open(resolve(record.directory, 'coordinator.log'), 'ax', 0o600)
  const bun = process.versions.bun ? process.execPath : 'bun'
  // The launcher and production preview both run from the studio checkout.
  const child = spawn(bun, [resolve(process.cwd(), 'tool/run-workspace-job.ts'), record.detail.id], {
    cwd: process.cwd(), detached: true, stdio: ['pipe', 'pipe', log.fd],
    env: { ...process.env, STUDIO_RUN_TOKEN: lease.token },
  })
  let transferred = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let output = ''
  const ready = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', () => reject(new Error('Job coordinator exited before readiness')))
    child.stdout?.on('data', chunk => { output += String(chunk); if (output.includes('READY\n')) resolve() })
    timer = setTimeout(() => reject(new Error('Job coordinator startup timed out')), 15_000)
  })
  void ready.catch(() => {})
  child.stdin?.on('error', () => {})
  try {
    if (!child.pid) { await ready; throw new Error('Job coordinator did not start') }
    await lease.transfer(child.pid)
    transferred = true
    child.stdin!.end('GO\n')
    await ready
    child.stdout?.destroy()
    child.unref()
  }
  catch (error) {
    child.stdin?.end()
    if (!transferred) child.kill('SIGTERM')
    if (transferred) throw new CoordinatorOwnershipError()
    throw error
  }
  finally {
    if (timer) clearTimeout(timer)
    await log.close()
  }
}
