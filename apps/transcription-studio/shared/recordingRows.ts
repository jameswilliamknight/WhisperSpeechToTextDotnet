import type { SourceFile, TranscriptionJob } from './workspace'

export interface RecordingRow {
  id: string
  name: string
  source?: SourceFile
  latest?: TranscriptionJob
  transcript?: TranscriptionJob
  jobIds: string[]
}

/** A projection, not another database table or Pinia cache. Keep all immutable
 * attempts underneath one file row, including the last good result after failure. */
export function recordingRows(files: readonly SourceFile[], jobs: readonly TranscriptionJob[]): RecordingRow[] {
  const rows = new Map<string, RecordingRow>()
  for (const source of files) {
    const id = source.recordingId ?? `legacy:${source.name}`
    rows.set(id, { id, name: source.name, source, jobIds: [] })
  }
  for (const job of [...jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))) {
    const id = job.recordingId ?? `legacy:${job.name}`
    const row = rows.get(id) ?? { id, name: job.name, jobIds: [] }
    row.latest ??= job
    if (job.status === 'succeeded' && job.hasTranscript !== false) row.transcript ??= job
    row.jobIds.push(job.id)
    rows.set(id, row)
  }
  return [...rows.values()].sort((a, b) => (b.latest?.startedAt ?? b.source?.modifiedAt ?? '').localeCompare(a.latest?.startedAt ?? a.source?.modifiedAt ?? '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function successfulFallback(jobs: readonly TranscriptionJob[], selected: TranscriptionJob): TranscriptionJob | undefined {
  if (selected.status === 'running' || selected.status === 'succeeded') return
  return recordingRows([], jobs).find(row => row.jobIds.includes(selected.id))?.transcript
}
