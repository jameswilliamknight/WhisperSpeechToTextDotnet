import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobProgress } from '../../shared/workspace'
import type { JobRecord } from './store'

const maximumProgressBytes = 2048

function validProgress(value: unknown): value is JobProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const progress = value as Record<string, unknown>
  return typeof progress.stage === 'string' && progress.stage.length > 0 && progress.stage.length <= 80
    && (progress.percent === null || (Number.isInteger(progress.percent) && Number(progress.percent) >= 0 && Number(progress.percent) <= 100))
    && typeof progress.updatedAt === 'string' && progress.updatedAt.length <= 40
}

/** Progress is read on demand from a metadata-only file; it never enters a result or transcript log. */
export async function jobProgress(record: JobRecord): Promise<JobProgress | undefined> {
  if (record.detail.status !== 'running') return record.detail.progress
  try {
    const path = join(record.directory, 'progress.json')
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumProgressBytes) return undefined
    const value = JSON.parse(await readFile(path, 'utf8'))
    return validProgress(value) ? value : undefined
  }
  catch { return undefined }
}
