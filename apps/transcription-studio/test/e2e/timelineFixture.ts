import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BenchmarkRun, StudioSnapshot, WorkerResult } from '../../shared/studio'
import type { TranscriptionDetail, WorkspaceSnapshot } from '../../shared/workspace'
import { mockSourceWatch } from './sourceWatchMock'

export const duration = 180
export const result: WorkerResult = {
  segments: [
    { start: 0, end: 8, text: 'Synthetic opening.', speaker: 'a' },
    { start: 60, end: 68, text: 'Synthetic second speaker.', speaker: 'b' },
  ],
  turns: [{ start: 0, end: 8, speaker: 'a' }, { start: 60, end: 68, speaker: 'b' }],
  stages: {}, metadata: { runtime: 'synthetic', models: [], backend: 'test' }, warnings: [],
}

// Real decodable PCM exercises the browser media pipeline, not a mocked clock.
export function silentWav(seconds: number) {
  const sampleRate = 8000
  const bytes = seconds * sampleRate * 2
  const wav = Buffer.alloc(44 + bytes)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(bytes, 40)
  return wav
}

export async function mockReview(page: Page, surface: 'workspace' | 'benchmarks', reviewResult: WorkerResult = result) {
  await mockSourceWatch(page)
  const wav = silentWav(duration)
  const job: TranscriptionDetail = {
    id: 'synthetic-timeline', name: 'synthetic-timeline.wav', status: 'succeeded', phase: 'Complete',
    startedAt: '2026-11-02T00:00:00Z', durationSeconds: duration, audioAvailable: true, result: reviewResult,
  }
  const workspace: WorkspaceSnapshot = {
    settings: { sourceDirectory: '/synthetic/source', workingDirectory: '/synthetic/work', outputDirectory: '/synthetic/output' },
    preferences: { selectedJobId: job.id, copyWithSpeakers: true }, jobs: [job], activeJobId: null,
    engine: { available: true },
  }
  const run: BenchmarkRun = {
    id: '00000000-0000-0000-0000-000000000001', backend: 'nemo', preset: 'smoke',
    status: 'succeeded', phase: 'Complete', startedAt: job.startedAt, durationSeconds: duration,
    wallSeconds: 3, realTimeFactor: 60, integrityVerified: true, result: reviewResult,
  }
  const studio: StudioSnapshot = {
    source: { prepared: true, label: 'Synthetic recording', durationSeconds: duration, bytes: wav.length, sha256: 'synthetic', verifiedAt: job.startedAt },
    backends: [{ id: 'nemo', name: 'Synthetic backend', acceleration: 'CPU', description: 'Synthetic fixture', available: true }],
    runs: [run], activeRunId: null,
  }
  const unexpected: string[] = []
  // Fail closed: unmatched API calls must never reach the owner's workspace.
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/audio' || path === `/api/transcriptions/${job.id}/audio`) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '')
      const start = range ? Number(range[1]) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1
      await route.fulfill({
        status: range ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1),
        headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}) },
      })
      return
    }
    if (path === '/api/workspace') { await route.fulfill({ json: workspace }); return }
    if (path === '/api/workspace/preferences' && route.request().method() === 'PUT') {
      workspace.preferences = { ...workspace.preferences, ...route.request().postDataJSON() }
      await route.fulfill({ json: workspace.preferences }); return
    }
    if (path === `/api/transcriptions/${job.id}/speakers` && route.request().method() === 'PUT') {
      job.speakerNames = (route.request().postDataJSON() as { speakerNames: Record<string, string> }).speakerNames
      await route.fulfill({ json: job.speakerNames }); return
    }
    if (path === '/api/source-files') { await route.fulfill({ json: { files: [] } }); return }
    if (path === `/api/transcriptions/${job.id}`) { await route.fulfill({ json: job }); return }
    if (path === '/api/studio') { await route.fulfill({ json: studio }); return }
    unexpected.push(`${route.request().method()} ${path}`)
    await route.fulfill({ status: 500, json: { statusMessage: 'Unexpected synthetic request' } })
  })
  await page.goto(surface === 'workspace' ? '/' : '/benchmarks')
  await expect(page.getByRole('heading', { name: 'Speaker timeline' })).toBeVisible()
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).duration)).toBe(duration)
  return unexpected
}
