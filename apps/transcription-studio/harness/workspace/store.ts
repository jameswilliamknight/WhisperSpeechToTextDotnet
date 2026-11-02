import { Database } from 'bun:sqlite'
import { chmodSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import type { LocationSettings, TranscriptionDetail, WorkspacePreferences } from '../../shared/workspace'
import type { Fingerprint } from '../source/integrity'
import { privateDirectory, privateRoot } from '../paths'
import { defaults } from './locations'

export interface JobRecord {
  detail: TranscriptionDetail
  settings: LocationSettings
  directory: string
  inputPath: string
  audioPath: string
  original?: { path: string; fingerprint: Fingerprint }
  cancelRequested?: boolean
}
const preferenceDefaults: WorkspacePreferences = { selectedJobId: null, copyWithSpeakers: true }
const databasePath = join(privateRoot, 'workspace.sqlite')

async function database(): Promise<Database> {
  await privateDirectory(privateRoot)
  chmodSync(privateRoot, 0o700)
  // SQLite follows sidecar links too. Refuse all symlinked/nonregular state, even before opening.
  for (const suffix of ['', '-wal', '-shm']) {
    try { if (!lstatSync(`${databasePath}${suffix}`).isFile()) throw new Error('Invalid workspace state file') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const db = new Database(databasePath, { create: true, strict: true })
  try {
    chmodSync(databasePath, 0o600)
    db.exec('PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    const version = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version
    if (version > 1) throw new Error('Workspace database version is newer than this application')
    db.transaction(() => {
      db.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 1;')
    }).immediate()
    for (const suffix of ['-wal', '-shm']) {
      try { chmodSync(`${databasePath}${suffix}`, 0o600) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    return db
  }
  catch (error) { db.close(); throw error }
}

async function use<T>(action: (db: Database) => T): Promise<T> {
  const db = await database()
  try { return action(db) } finally { db.close() }
}
async function readState<T>(key: string, fallback: T): Promise<T> {
  return use(db => {
    const row = db.query<{ value: string }, [string]>('SELECT value FROM state WHERE key = ?').get(key)
    return row ? JSON.parse(row.value) as T : { ...fallback }
  })
}
async function writeState(key: string, value: unknown): Promise<void> {
  await use(db => { db.query('INSERT OR REPLACE INTO state (key,value) VALUES (?,?)').run(key, JSON.stringify(value)) })
}
export const settings = () => readState('settings', defaults)
export const preferences = () => readState('preferences', preferenceDefaults)
export const saveSettings = (value: LocationSettings) => writeState('settings', value)
export const savePreferences = (value: WorkspacePreferences) => writeState('preferences', value)
export async function saveJob(record: JobRecord): Promise<void> {
  await use(db => db.transaction(() => {
    const existing = db.query<{ value: string }, [string]>('SELECT value FROM jobs WHERE id = ?').get(record.detail.id)
    if (existing && (JSON.parse(existing.value) as JobRecord).cancelRequested) record.cancelRequested = true
    db.query('INSERT OR REPLACE INTO jobs (id,value) VALUES (?,?)').run(record.detail.id, JSON.stringify(record))
  }).immediate())
}
export async function job(id: string): Promise<JobRecord> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id)) throw new Error('Invalid transcription identifier')
  return use(db => {
    const row = db.query<{ value: string }, [string]>('SELECT value FROM jobs WHERE id = ?').get(id)
    if (!row) throw new Error('Transcription not found')
    return JSON.parse(row.value) as JobRecord
  })
}
export async function jobs(): Promise<JobRecord[]> {
  return use(db => db.query<{ value: string }, []>('SELECT value FROM jobs').all().map(row => JSON.parse(row.value) as JobRecord).sort((a, b) => b.detail.startedAt.localeCompare(a.detail.startedAt)))
}
/** Completion and cancellation share one SQLite linearization point, not an event-loop timing window. */
export async function commitSucceeded(record: JobRecord, signal: AbortSignal): Promise<boolean> {
  return use(db => db.transaction(() => {
    const row = db.query<{ value: string }, [string]>('SELECT value FROM jobs WHERE id = ?').get(record.detail.id)
    if (!row) throw new Error('Transcription not found')
    const saved = JSON.parse(row.value) as JobRecord
    if (signal.aborted || saved.cancelRequested) return false
    db.query('UPDATE jobs SET value = ? WHERE id = ?').run(JSON.stringify(record), record.detail.id)
    return true
  }).immediate())
}

export async function requestCancel(id: string): Promise<boolean> {
  return use(db => db.transaction(() => {
    const row = db.query<{ value: string }, [string]>('SELECT value FROM jobs WHERE id = ?').get(id)
    if (!row) throw new Error('Transcription not found')
    const record = JSON.parse(row.value) as JobRecord
    if (record.detail.status !== 'running') return false
    record.cancelRequested = true
    db.query('UPDATE jobs SET value = ? WHERE id = ?').run(JSON.stringify(record), id)
    return true
  }).immediate())
}
