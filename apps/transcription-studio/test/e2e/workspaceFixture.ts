import type { Page } from '@playwright/test'
import type { TranscriptionDetail, WorkspaceSnapshot } from '#shared/workspace'
import { mockSourceWatch } from './sourceWatchMock'

export function fixture(): WorkspaceSnapshot {
  return {
    settings: { sourceDirectory: '/synthetic/source', workingDirectory: '/synthetic/work', outputDirectory: '/synthetic/output' },
    preferences: { selectedJobId: null, copyWithSpeakers: true }, jobs: [], activeJobId: null,
    engine: { available: true },
  }
}
export const completed: TranscriptionDetail = {
  id: 'synthetic-job', name: 'sample.wav', status: 'succeeded', phase: 'Complete', startedAt: '2026-11-02T00:00:00Z', audioAvailable: false,
  result: {
    segments: [{ start: 0, end: 2, text: 'Synthetic transcript.', speaker: 'A' }], turns: [{ start: 0, end: 2, speaker: 'A' }],
    stages: {}, metadata: { runtime: 'synthetic', models: [], backend: 'whisper' }, warnings: [],
  },
}

export async function mockWorkspace(page: Page, snapshot: WorkspaceSnapshot) {
  await mockSourceWatch(page)
  const requests = { metadata: 0, details: 0, starts: [] as unknown[], uploads: [] as { name: string | null; type: string | undefined }[], speakers: [] as Record<string, string>[] }
  let current: TranscriptionDetail = { ...completed }
  // Fail closed: unmocked calls must never touch the owner's real workspace.
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/api/studio') { await route.fulfill({ json: { source: { prepared: false }, backends: [], runs: [], activeRunId: null } }); return }
    if (url.pathname === '/api/workspace') { requests.metadata++; await route.fulfill({ json: snapshot }); return }
    if (url.pathname === '/api/workspace/preferences') { snapshot.preferences = request.postDataJSON(); await route.fulfill({ json: snapshot.preferences }); return }
    if (url.pathname === '/api/workspace/settings') { snapshot.settings = request.postDataJSON(); await route.fulfill({ json: snapshot.settings }); return }
    if (url.pathname === '/api/transcriptions/synthetic-job/speakers') {
      const { speakerNames } = request.postDataJSON() as { speakerNames: Record<string, string> }
      requests.speakers.push(speakerNames); current = { ...current, speakerNames }
      await route.fulfill({ json: speakerNames }); return
    }
    if (url.pathname === '/api/source-files') { await route.fulfill({ json: { files: [{ name: 'directory.wav', bytes: 100, modifiedAt: '2026-11-02T00:00:00Z' }] } }); return }
    if (url.pathname === '/api/transcriptions' || url.pathname === '/api/transcriptions/upload') {
      const startBody = url.pathname.endsWith('/upload') ? undefined : request.postDataJSON() as { sourceName: string }
      if (url.pathname.endsWith('/upload')) requests.uploads.push({ name: url.searchParams.get('name'), type: request.headers()['content-type'] })
      else requests.starts.push(startBody)
      current = { ...completed, name: url.searchParams.get('name') ?? startBody!.sourceName,
        startedAt: new Date().toISOString(), status: 'running', phase: 'Transcribing', result: undefined,
        progress: { stage: 'Transcribing audio', percent: 42, updatedAt: '2026-11-02T00:00:00Z' } }
      const { result: _result, audioAvailable: _audio, ...metadata } = current
      snapshot.jobs = [metadata]; snapshot.activeJobId = current.id
      await route.fulfill({ status: 202, json: metadata }); return
    }
    if (url.pathname.endsWith('/cancel')) { current = { ...current, status: 'cancelled', phase: 'Cancelled' }; snapshot.jobs = [{ ...snapshot.jobs[0]!, status: 'cancelled' }]; snapshot.activeJobId = null; await route.fulfill({ json: { cancelled: true } }); return }
    if (url.pathname === '/api/transcriptions/synthetic-job') { requests.details++; await route.fulfill({ json: current }); return }
    await route.fulfill({ status: 500, json: { statusMessage: `Unexpected synthetic request: ${url.pathname}` } })
  })
  return { requests, complete: () => { current = { ...completed }; snapshot.jobs = [{ ...snapshot.jobs[0]!, status: 'succeeded' }]; snapshot.activeJobId = null } }
}
