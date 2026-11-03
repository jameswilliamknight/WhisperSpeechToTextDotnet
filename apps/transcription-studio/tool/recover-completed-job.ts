import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireRunLock } from '~~/harness/runs/store'
import { parseWorkerResult } from '~~/harness/backends/result'
import { finalizeTranscript } from '~~/harness/workspace/finalize'
import { backupWorkspace } from '~~/harness/workspace/maintenance'
import { noSymlinks } from '~~/harness/workspace/locations'
import { job } from '~~/harness/workspace/store'

/** Explicit recovery only, after the old server/coordinator and native group
 * have exited. Never infer completion merely from an ASR percentage of 100. */
const release = await acquireRunLock()
try {
  const record = await job(process.argv[2] ?? '')
  if (!['running', 'interrupted'].includes(record.detail.status) || record.cancelRequested) throw new Error('Job is not eligible for completed-result recovery')
  const progressPath = join(record.directory, 'progress.json'), resultPath = join(record.directory, 'result.json')
  await noSymlinks(progressPath); await noSymlinks(resultPath)
  const progress = JSON.parse(await readFile(progressPath, 'utf8'))
  if (progress.stage !== 'Complete' || progress.percent !== 100) throw new Error('Worker did not report completed result output')
  const result = parseWorkerResult(JSON.parse(await readFile(resultPath, 'utf8')))
  if (!result.segments.length || !result.turns.length || !record.detail.durationSeconds || [...result.segments, ...result.turns].some(span => span.end > record.detail.durationSeconds! + 2)) throw new Error('Invalid completed result')
  const backup = await backupWorkspace('before-completed-recovery')
  const elapsed = Date.parse(progress.updatedAt) - Date.parse(record.detail.startedAt)
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid completion time')
  record.detail.result = result
  // Finalisation rechecks original integrity, creates exports exclusively, and
  // commits success with the normal cancellation/SQLite linearisation checks.
  await finalizeTranscript(record, new AbortController(), performance.now() - elapsed)
  console.log(JSON.stringify({ id: record.detail.id, status: 'succeeded', recoveredWithoutInference: true, backup }))
}
finally { await release() }
