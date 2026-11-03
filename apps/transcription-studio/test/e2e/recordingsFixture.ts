import type { Page } from '@playwright/test'
import type { SourceFile, TranscriptionDetail } from '#shared/workspace'
import { completed, fixture } from './workspaceFixture'
import { mockSourceWatch } from './sourceWatchMock'

export async function mockRecordings(page: Page) {
  await mockSourceWatch(page)
  const good: TranscriptionDetail = { ...completed, id: 'good', name: 'alpha.wav', recordingId: 'recording-a', hasTranscript: true, retryAvailable: true }
  const failed: TranscriptionDetail = { ...completed, id: 'failed', name: 'beta.wav', recordingId: 'recording-b', hasTranscript: false, result: undefined, status: 'failed', error: 'Synthetic failure', retryAvailable: true }
  const state = fixture()
  state.jobs = [good, failed]; state.preferences.selectedJobId = good.id
  const details = new Map([[good.id, good], [failed.id, failed]])
  const files: SourceFile[] = ['alpha', 'beta', 'new'].map((name, index) => ({ name: `${name}.wav`, recordingId: ['recording-a', 'recording-b', 'recording-new'][index], bytes: 100, modifiedAt: good.startedAt }))
  const requests = { retries: [] as string[], starts: [] as string[], unexpected: [] as string[] }
  let running: TranscriptionDetail | undefined
  function begin(previous: TranscriptionDetail) {
    running = { ...previous, id: `new-${requests.retries.length + requests.starts.length}`, status: 'running', phase: 'Transcribing', startedAt: new Date().toISOString(), result: undefined, hasTranscript: false, error: undefined, progress: { stage: 'Transcribing audio', percent: 30, updatedAt: new Date().toISOString() } }
    details.set(running.id, running); state.jobs = [running, ...state.jobs]; state.activeJobId = running.id
    return running
  }
  function finish(status: 'succeeded' | 'failed' | 'cancelled') {
    if (!running) throw new Error('No synthetic job running')
    const next = { ...running, status, finishedAt: new Date().toISOString(), wallSeconds: 42, hasTranscript: status === 'succeeded', result: status === 'succeeded' ? completed.result : undefined, error: status === 'failed' ? 'Synthetic retry failed' : undefined }
    details.set(next.id, next); state.jobs = state.jobs.map(job => job.id === next.id ? next : job); state.activeJobId = null; running = undefined
  }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/workspace') return route.fulfill({ json: state })
    if (path === '/api/workspace/preferences') { state.preferences = route.request().postDataJSON(); return route.fulfill({ json: state.preferences }) }
    if (path === '/api/source-files') return route.fulfill({ json: { files } })
    if (path === '/api/transcriptions/upload') return route.fulfill({ status: 409, json: { message: 'Already attempted', data: { retryJobId: good.id } } })
    if (path === '/api/transcriptions') {
      const { sourceName } = route.request().postDataJSON() as { sourceName: string }
      requests.starts.push(sourceName)
      return route.fulfill({ status: 202, json: begin({ ...good, name: sourceName, recordingId: 'recording-new' }) })
    }
    const retry = /^\/api\/transcriptions\/([^/]+)\/retry$/.exec(path)
    if (retry) { const previous = details.get(retry[1]!)!; requests.retries.push(previous.id); return route.fulfill({ status: 202, json: begin(previous) }) }
    if (path.endsWith('/cancel')) { finish('cancelled'); return route.fulfill({ json: { cancelled: true } }) }
    const detail = /^\/api\/transcriptions\/([^/]+)$/.exec(path)
    if (detail && details.has(detail[1]!)) return route.fulfill({ json: details.get(detail[1]!) })
    requests.unexpected.push(path)
    return route.fulfill({ status: 500, json: { message: 'Unexpected synthetic request' } })
  })
  return { state, files, requests, finish }
}
