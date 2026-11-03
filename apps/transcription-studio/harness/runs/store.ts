import { Database } from 'bun:sqlite'
import { chmodSync, lstatSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { BenchmarkRun } from '../../shared/studio'
import { privateDirectory, privateRoot } from '../paths'
import { readJson, writeJson } from '../files'

export const runsDirectory = resolve(privateRoot, 'runs')
const lockPath = resolve(privateRoot, 'run.lock')
const databasePath = resolve(privateRoot, 'runner.sqlite')
const fencePath = resolve(privateRoot, 'worker-group.json')

export function runDirectory(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid run identifier')
  return resolve(runsDirectory, id)
}

export async function saveRun(run: BenchmarkRun): Promise<void> {
  const directory = await privateDirectory(runDirectory(run.id))
  await writeJson(resolve(directory, 'run.json'), run)
}

export async function listRuns(): Promise<BenchmarkRun[]> {
  await privateDirectory(runsDirectory)
  const entries = await readdir(runsDirectory, { withFileTypes: true })
  const runs = await Promise.all(entries.filter(entry => entry.isDirectory() && /^[0-9a-f-]{36}$/.test(entry.name)).map(async entry => {
    try { return await readJson<BenchmarkRun>(resolve(runsDirectory, entry.name, 'run.json')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  }))
  return runs.filter((run): run is BenchmarkRun => !!run).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

function jsonFile<T>(path: string): T | undefined {
  try {
    if (!lstatSync(path).isFile()) throw new Error('Invalid runner state file')
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

function alive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid === 0) throw new Error('Invalid runner process identity')
  try { process.kill(pid, 0); return true }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

/** A reused PID/group is conservatively treated as live; recovery never signals unknown processes. */
function externallyBusy(): boolean {
  const legacy = jsonFile<{ pid: number }>(lockPath)
  if (legacy && (legacy.pid <= 0 || alive(legacy.pid))) return true
  const fence = jsonFile<{ ownerPid: number; pgid: number | null }>(fencePath)
  if (!fence) return false
  if (!Number.isSafeInteger(fence.ownerPid) || fence.ownerPid <= 0) throw new Error('Invalid worker fence')
  if (fence.pgid !== null && (!Number.isSafeInteger(fence.pgid) || fence.pgid <= 0)) throw new Error('Invalid worker group')
  return alive(fence.ownerPid) || (fence.pgid !== null && alive(-fence.pgid))
}

/** Short synchronous transactions serialize both admission and recovery; never await while holding SQLite. */
async function database(): Promise<Database> {
  await privateDirectory(runsDirectory)
  try { if (!lstatSync(databasePath).isFile()) throw new Error('Invalid runner database') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const db = new Database(databasePath, { create: true, strict: true })
  try {
    chmodSync(databasePath, 0o600)
    db.exec('PRAGMA busy_timeout = 2000; PRAGMA journal_mode = DELETE; CREATE TABLE IF NOT EXISTS owner (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), token TEXT NOT NULL, pid INTEGER NOT NULL)')
    return db
  }
  catch (error) { db.close(); throw error }
}

function currentOwner(db: Database): { token: string; pid: number } | null {
  return db.query<{ token: string; pid: number }, []>('SELECT token, pid FROM owner WHERE singleton = 1').get()
}

// Atomic per-record replacement means a crash can only leave some old records for the next recovery.
function markInterrupted(): void {
  for (const entry of readdirSync(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) continue
    const path = resolve(runDirectory(entry.name), 'run.json')
    const run = jsonFile<BenchmarkRun>(path)
    if (run?.status !== 'running') continue
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify({ ...run, status: 'interrupted', phase: 'Previous process stopped', finishedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
  }
}

export async function recoverInterruptedRuns(): Promise<void> {
  const db = await database()
  try {
    db.transaction(() => {
      const owner = currentOwner(db)
      if ((owner && alive(owner.pid)) || externallyBusy()) return
      markInterrupted()
      db.exec('DELETE FROM owner')
    }).immediate()
  }
  finally { db.close() }
}

/** Ownership is committed atomically, and an old release callback cannot remove its successor. */
export interface RunLease {
  (): Promise<void>
  readonly token: string
  transfer(pid: number): Promise<void>
}

export async function releaseRunLock(token: string): Promise<void> {
  const db = await database()
  try { db.query('DELETE FROM owner WHERE singleton = 1 AND token = ?').run(token) }
  finally { db.close() }
}

export async function currentLeaseToken(): Promise<string | undefined> {
  const db = await database()
  try { return currentOwner(db)?.token }
  finally { db.close() }
}

export async function assertRunOwner(token: string): Promise<void> {
  const db = await database()
  try {
    const owner = currentOwner(db)
    if (owner?.token !== token || owner.pid !== process.pid) throw new Error('Job coordinator does not own native admission')
  }
  finally { db.close() }
}

export async function acquireRunLock(): Promise<RunLease> {
  const db = await database()
  const token = crypto.randomUUID()
  try {
    db.transaction(() => {
      const owner = currentOwner(db)
      if ((owner && alive(owner.pid)) || externallyBusy()) throw new Error('Another benchmark or native worker is already running')
      markInterrupted()
      db.query('INSERT OR REPLACE INTO owner (singleton, token, pid) VALUES (1, ?, ?)').run(token, process.pid)
    }).immediate()
  }
  finally { db.close() }
  return Object.assign(() => releaseRunLock(token), {
    token,
    async transfer(pid: number) {
      if (!Number.isSafeInteger(pid) || pid <= 0 || !alive(pid)) throw new Error('Invalid coordinator process')
      const transferDb = await database()
      try {
        transferDb.transaction(() => {
          const owner = currentOwner(transferDb)
          if (owner?.token !== token || owner.pid !== process.pid) throw new Error('Native admission ownership changed')
          transferDb.query('UPDATE owner SET pid = ? WHERE singleton = 1 AND token = ?').run(pid, token)
        }).immediate()
      }
      finally { transferDb.close() }
    },
  })
}
