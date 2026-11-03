import { constants } from 'node:fs'
import { access, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobRecord } from './store'
import { maxInputBytes, noSymlinks } from './locations'
import { directoryRecordingId } from './recordingIdentity'

export class ExistingRecordingError extends Error {
  constructor(readonly retryJobId: string) { super('This recording has already been attempted. Confirm retranscription to continue.') }
}

export function recordingId(record: JobRecord): string {
  return record.detail.recordingId ?? (record.original
    ? directoryRecordingId(record.original.path)
    : `upload:${record.detail.id}`)
}

/** Retried uploads use their retained private input; directory jobs always use
 * the recorded source, never a similarly named file in today's Settings folder. */
export function retrySource(record: JobRecord): string {
  if (record.sourceKind === 'upload' || (!record.sourceKind && !record.original)) return record.inputPath
  return record.original?.path ?? join(record.settings.sourceDirectory, record.detail.name)
}

export async function retryAvailability(record: JobRecord) {
  try {
    const path = retrySource(record)
    await noSymlinks(path)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxInputBytes) throw new Error('Invalid recording')
    await access(path, constants.R_OK)
    return { retryAvailable: true }
  }
  catch {
    return { retryAvailable: false, retryUnavailableReason: record.sourceKind === 'upload' || !record.original ? 'The retained audio file is unavailable.' : 'The original recording is unavailable.' }
  }
}
