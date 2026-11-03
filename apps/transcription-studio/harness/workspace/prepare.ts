import { createHash } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { copySource, streamInput } from './input'
import { sourceName, validateSettings, writableDirectory } from './locations'
import { directoryRecordingId, uploadRecordingId } from './recordingIdentity'
import { ExistingRecordingError, recordingId, retryAvailability, retrySource } from './recordings'
import * as store from './store'

/** Retain the native-admission lease if durable failure state cannot be recorded. */
export class UnpersistedPreparationError extends Error {
  constructor() { super('Input preparation could not be persisted; worker admission remains fenced') }
}

/** Every attempt owns a new input copy and exclusive exports. Prior results and
 * their name sidecars are never overwritten, including when a retry fails. */
export async function prepareTranscription(name: unknown, upload?: Readable, previous?: store.JobRecord): Promise<store.JobRecord> {
  const leaf = sourceName(name)
  const settings = await validateSettings(await store.settings())
  if (previous && !(await retryAvailability(previous)).retryAvailable) throw new Error('The recording is unavailable for retranscription')
  if (!previous && !upload && !settings.sourceDirectory) throw new Error('Configure a source directory or upload an audio file')
  await writableDirectory(settings.workingDirectory)
  await writableDirectory(settings.outputDirectory)
  const id = crypto.randomUUID(), directory = join(settings.workingDirectory, id)
  await mkdir(directory, { mode: 0o700 })
  const path = previous ? retrySource(previous) : join(settings.sourceDirectory, leaf)
  const sourceKind = previous?.sourceKind ?? (previous ? previous.original ? 'directory' : 'upload' : upload ? 'upload' : 'directory')
  const record: store.JobRecord = {
    detail: { id, name: leaf, status: 'running', phase: 'Copying audio into private workspace', startedAt: new Date().toISOString(), audioAvailable: false,
      recordingId: previous ? recordingId(previous) : upload ? `upload:${id}` : directoryRecordingId(path) },
    sourceKind, settings, directory, inputPath: join(directory, `source${extname(leaf).toLowerCase()}`), audioPath: join(directory, 'input.wav'),
  }
  try {
    if (upload) {
      // Identify uploads while streaming: no browser-side multi-GB hash buffer.
      // A duplicate prompts before inference and does not create a failed attempt.
      const hash = createHash('sha256')
      await streamInput(record.inputPath, upload, undefined, hash)
      record.detail.recordingId = uploadRecordingId(leaf, hash.digest('hex'))
      const existing = (await store.jobs()).find(job => recordingId(job) === record.detail.recordingId)
      if (existing) throw new ExistingRecordingError(existing.detail.id)
    }
    else {
      await store.saveJob(record)
      await copySource(record, path)
    }
    record.detail.phase = 'Preparing working audio'
    await store.saveJob(record)
    return record
  }
  catch (error) {
    if (error instanceof ExistingRecordingError) await rm(directory, { recursive: true, force: true })
    else {
      record.detail.status = 'failed'; record.detail.phase = 'Input preparation failed'
      record.detail.error = error instanceof Error ? error.message : 'Input preparation failed'
      record.detail.finishedAt = new Date().toISOString()
      try { await store.saveJob(record) }
      catch { throw new UnpersistedPreparationError() }
    }
    throw error
  }
}
