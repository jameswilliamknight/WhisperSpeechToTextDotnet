import { access, lstat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type { LocationSettings, TranscriptionJob, WorkspacePreferences, WorkspaceSnapshot } from '#shared/workspace'
import { adapterConfiguration } from '../backends/registry'
import { acquireRunLock, currentLeaseToken } from '../runs/store'
import { launchCoordinator, CoordinatorOwnershipError } from './coordinator'
import { noSymlinks, validateSettings } from './locations'
import { prepareTranscription, UnpersistedPreparationError } from './prepare'
import { recordingId, retryAvailability } from './recordings'
import { jobProgress } from './progress'
import * as store from './store'

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
  return { ...metadata, recordingId: recordingId(record), hasTranscript: !!record.detail.result && record.detail.status === 'succeeded' }
}

export async function workspaceSnapshot(): Promise<WorkspaceSnapshot> {
  await recoverIfIdle()
  const jobs = await Promise.all((await store.jobs()).map(async record => {
    const item = summary(record)
    const progress = await jobProgress(record)
    if (progress) item.progress = progress
    return { ...item, ...await retryAvailability(record) }
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
  const previous = await store.preferences()
  const saved = { selectedJobId: input.selectedJobId, copyWithSpeakers: input.copyWithSpeakers,
    disablePlaybackPulse: input.disablePlaybackPulse ?? previous.disablePlaybackPulse,
    transcriptProcessing: { ...previous.transcriptProcessing, ...input.transcriptProcessing } }
  await store.savePreferences(saved)
  return saved
}

export async function updateSpeakerNames(id: string, input: Record<string, string>): Promise<Record<string, string>> {
  return store.updateSpeakerNames(id, input)
}

export async function startTranscription(name: unknown, upload?: Readable, retryId?: string): Promise<TranscriptionJob> {
  const engine = await engineReadiness()
  if (!engine.available) throw new Error(engine.reason)
  const release = await acquireRunLock()
  let record: store.JobRecord | undefined
  try {
    await recoverOwned()
    const previous = retryId ? await store.job(retryId) : undefined
    record = await prepareTranscription(previous?.detail.name ?? name, upload, previous)
    await launchCoordinator(record, release)
  }
  catch (error) {
    if (error instanceof UnpersistedPreparationError || error instanceof CoordinatorOwnershipError) throw error
    await release()
    throw error
  }
  return summary(record)
}

export async function retryTranscription(id: string): Promise<TranscriptionJob> {
  return startTranscription(undefined, undefined, id)
}

export async function transcriptionDetail(id: string) {
  await recoverIfIdle()
  const record = await store.job(id)
  const progress = await jobProgress(record)
  return progress ? { ...record.detail, progress } : record.detail
}

export async function cancelTranscription(id: string): Promise<void> {
  const token = await currentLeaseToken()
  if (!await store.requestCancel(id)) return
  // Cross-process requests wait for durable completion: no success before worker cleanup and lease release.
  const deadline = Date.now() + 30_000
  while ((await store.job(id)).detail.status === 'running' || (token && await currentLeaseToken() === token)) {
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
