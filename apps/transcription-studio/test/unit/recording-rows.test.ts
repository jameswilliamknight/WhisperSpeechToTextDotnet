import { expect, test } from 'bun:test'
import { recordingRows, successfulFallback } from '#shared/recordingRows'
import type { TranscriptionJob } from '#shared/workspace'

const success: TranscriptionJob = { id: 'success', recordingId: 'folder-a-file', name: 'same.wav', status: 'succeeded', phase: 'Complete', startedAt: '2026-11-01T00:00:00Z', hasTranscript: true, retryAvailable: true }
const failed: TranscriptionJob = { ...success, id: 'failed', status: 'failed', phase: 'Failed', startedAt: '2026-11-02T00:00:00Z', hasTranscript: false }
const source = { recordingId: success.recordingId, name: success.name, bytes: 100, modifiedAt: success.startedAt }

test('source and attempts form one row with latest status and last good transcript', () => {
  const rows = recordingRows([source], [success, failed])
  expect(rows).toHaveLength(1)
  expect(rows[0]?.source).toEqual(source)
  expect(rows[0]?.latest?.id).toBe('failed')
  expect(rows[0]?.transcript?.id).toBe('success')
  expect(rows[0]?.jobIds).toEqual(['failed', 'success'])
  expect(successfulFallback([success, failed], failed)?.id).toBe('success')
})
test('same filename from different folders and different uploads never merges', () => {
  const other = { ...success, id: 'other', recordingId: 'folder-b-file' }
  const upload = { ...success, id: 'upload', recordingId: 'upload-content-a' }
  const differentUpload = { ...upload, id: 'upload-b', recordingId: 'upload-content-b' }
  expect(recordingRows([source], [success, other, upload, differentUpload])).toHaveLength(4)
})
test('unavailable historical source remains selectable and retains a successful result', () => {
  const missing = { ...failed, retryAvailable: false, retryUnavailableReason: 'Original unavailable' }
  const rows = recordingRows([], [success, missing])
  expect(rows).toHaveLength(1)
  expect(rows[0]?.latest?.retryAvailable).toBe(false)
  expect(rows[0]?.transcript?.id).toBe(success.id)
})
test('never attempted files have no retry and successful/running selections have no fallback', () => {
  expect(recordingRows([source], [])[0]?.latest).toBeUndefined()
  expect(successfulFallback([success], success)).toBeUndefined()
  expect(successfulFallback([success], { ...failed, status: 'running' })).toBeUndefined()
})
