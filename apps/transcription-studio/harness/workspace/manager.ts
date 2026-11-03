import { access, lstat, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { extname, join } from 'node:path'
import type { Readable } from 'node:stream'
import type { LocationSettings, TranscriptionJob, WorkspacePreferences, WorkspaceSnapshot } from '../../shared/workspace'
import { adapterConfiguration } from '../backends/registry'
import { acquireRunLock } from '../runs/store'
import { executeJob } from './execute'
import { copySource, streamInput } from './input'
import { noSymlinks, sourceName, validateSettings, writableDirectory } from './locations'
import { jobProgress } from './progress'
import * as store from './store'

interface Active { record: store.JobRecord; controller: AbortController; done: Promise<void> }
const stateKey = Symbol.for('transcription-studio.workspace')
const root = globalThis as typeof globalThis & { [stateKey]?: { active?: Active } }
const state = root[stateKey] ??= {}

export async function engineReadiness(): Promise<WorkspaceSnapshot['engine']> {
  try {
    const adapter = await adapterConfiguration('whisper')
    if (!adapter) return { available: false, reason: 'Configure the local Whisper + Nemotron worker first.' }
    await access(adapter.command[0]!, constants.X_OK)
    await access(adapter.cwd, constants.R_OK)
    if (!(await lstat(adapter.cwd)).isDirectory()) throw new Error('Invalid worker directory')
    for (const binary of ['ffprobe', 'ffmpeg']) {
      let found = false
      for (const directory of (process.env.PATH || '').split(':').filter(Boolean)) {
        try { await access(join(directory, binary), constants.X_OK); found = true; break } catch { /* Search PATH. */ }
      }
      if (!found) return { available: false, reason: `Install ${binary} before transcribing audio.` }
    }
    return { available: true }
  }
  catch { return { available: false, reason: 'Local Whisper worker configuration is unavailable or invalid.' } }
}

/** Recovery runs only while holding the SAME lease as benchmarks and native process admission. */
async function recoverOwned(): Promise<void> {
  for (const record of await store.jobs()) {
    if (record.detail.status !== 'running') continue
    record.detail.status = 'interrupted'
    record.detail.phase = 'Previous process stopped'
    record.detail.finishedAt = new Date().toISOString()
    await store.saveJob(record)
  }
}
async function recoverIfIdle(): Promise<void> {
  if (state.active) return
  let release: (() => Promise<void>)
  try { release = await acquireRunLock() }
  catch (error) {
    if (error instanceof Error && error.message === 'Another benchmark or native worker is already running') return
    throw error
  }
  // A failed recovery deliberately retains ownership, preventing processing with ambiguous persisted state.
  await recoverOwned()
  await release()
}

export function summary(record: store.JobRecord): TranscriptionJob {
  // Renames and transcript content stay in the detail response, not the polled job list.
  const { result: _result, audioAvailable: _audioAvailable, speakerNames: _speakerNames, ...metadata } = record.detail
  return metadata
}

export async function workspaceSnapshot(): Promise<WorkspaceSnapshot> {
  await recoverIfIdle()
  const jobs = await Promise.all((await store.jobs()).map(async record => {
    const item = summary(record)
    const progress = await jobProgress(record)
    if (progress) item.progress = progress
    return item
  }))
  return { settings: await store.settings(), preferences: await store.preferences(), jobs, activeJobId: jobs.find(job => job.status === 'running')?.id ?? null, engine: await engineReadiness() }
}

export async function updateSettings(input: LocationSettings): Promise<LocationSettings> {
  const release = await acquireRunLock()
  try {
    await recoverOwned()
    const settings = await validateSettings(input)
    await store.saveSettings(settings)
    return settings
  }
  finally { await release() }
}

export async function updatePreferences(input: WorkspacePreferences): Promise<WorkspacePreferences> {
  if (typeof input.copyWithSpeakers !== 'boolean' || (input.selectedJobId !== null && typeof input.selectedJobId !== 'string')) throw new Error('Invalid workspace preferences')
  if (input.selectedJobId !== null) await store.job(input.selectedJobId)
  const saved = { selectedJobId: input.selectedJobId, copyWithSpeakers: input.copyWithSpeakers }
  await store.savePreferences(saved)
  return saved
}

export async function updateSpeakerNames(id: string, input: Record<string, string>): Promise<Record<string, string>> {
  return store.updateSpeakerNames(id, input)
}

export async function startTranscription(name: unknown, upload?: Readable): Promise<TranscriptionJob> {
  const leaf = sourceName(name)
  const engine = await engineReadiness()
  if (!engine.available) throw new Error(engine.reason)
  const release = await acquireRunLock()
  let record: store.JobRecord | undefined
  try {
    await recoverOwned()
    const settings = await validateSettings(await store.settings())
    if (!upload && !settings.sourceDirectory) throw new Error('Configure a source directory or upload an audio file')
    await writableDirectory(settings.workingDirectory)
    await writableDirectory(settings.outputDirectory)
    const id = crypto.randomUUID()
    const directory = join(settings.workingDirectory, id)
    await mkdir(directory, { mode: 0o700 })
    record = {
      detail: { id, name: leaf, status: 'running', phase: 'Copying audio into private workspace', startedAt: new Date().toISOString(), audioAvailable: false },
      settings, directory, inputPath: join(directory, `source${extname(leaf).toLowerCase()}`), audioPath: join(directory, 'input.wav'),
    }
    await store.saveJob(record)
    if (upload) await streamInput(record.inputPath, upload)
    else await copySource(record, join(settings.sourceDirectory, leaf))
    record.detail.phase = 'Preparing working audio'
    await store.saveJob(record)
  }
  catch (error) {
    if (record) {
      record.detail.status = 'failed'; record.detail.phase = 'Input preparation failed'
      record.detail.error = error instanceof Error ? error.message : 'Input preparation failed'
      record.detail.finishedAt = new Date().toISOString()
      // Never free ownership if recording the failure fails.
      await store.saveJob(record)
    }
    await release()
    throw error
  }
  const active: Active = { record, controller: new AbortController(), done: Promise.resolve() }
  state.active = active
  active.done = executeJob(record, active.controller).then(async () => {
    await release()
    if (state.active === active) state.active = undefined
  })
  // Details stay private; a persistence failure retains lease admission until explicit recovery.
  void active.done.catch(() => {})
  return summary(record)
}

export async function transcriptionDetail(id: string) {
  await recoverIfIdle()
  const record = await store.job(id)
  const progress = await jobProgress(record)
  return progress ? { ...record.detail, progress } : record.detail
}

export async function cancelTranscription(id: string): Promise<void> {
  if (!await store.requestCancel(id)) return
  if (state.active?.record.detail.id === id) {
    state.active.controller.abort()
    await state.active.done
    return
  }
  // Cross-process requests wait for durable completion: no success before worker cleanup and lease release.
  const deadline = Date.now() + 30_000
  while ((await store.job(id)).detail.status === 'running') {
    await recoverIfIdle()
    if (Date.now() > deadline) throw new Error('Cancellation is still pending; native worker admission remains fenced')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

export async function audioFile(id: string): Promise<string> {
  const record = await store.job(id)
  if (!record.detail.audioAvailable) throw new Error('Working audio is not available yet')
  await noSymlinks(record.audioPath)
  return record.audioPath
}
