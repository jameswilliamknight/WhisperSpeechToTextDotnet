import { expect, test } from '@playwright/test'
import type { TranscriptionDetail, WorkspaceSnapshot } from '../../shared/workspace'
import { mockSourceWatch } from './sourceWatchMock'

test('success to failure preserves timeline geometry and restores interactive content', async ({ page }) => {
  const success: TranscriptionDetail = {
    id: 'success', name: 'success.wav', status: 'succeeded', phase: 'Complete', startedAt: '2026-11-02T00:00:00Z',
    result: {
      segments: [{ start: 0, end: 2, text: 'Synthetic transcript.', speaker: 'A' }],
      turns: [{ start: 0, end: 2, speaker: 'A' }, { start: 2, end: 4, speaker: 'B' }, { start: 4, end: 6, speaker: 'C' }],
      stages: {}, metadata: { runtime: 'synthetic', models: [], backend: 'whisper' }, warnings: [],
    },
  }
  const failed: TranscriptionDetail = { id: 'failed', name: 'failed.wav', status: 'failed', phase: 'Failed', startedAt: success.startedAt, error: 'Synthetic engine failure.' }
  const snapshot: WorkspaceSnapshot = {
    settings: { sourceDirectory: '', workingDirectory: '/synthetic/work', outputDirectory: '/synthetic/output' },
    preferences: { selectedJobId: success.id, copyWithSpeakers: true }, jobs: [success, failed], activeJobId: null, engine: { available: true },
  }
  await mockSourceWatch(page)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/workspace') return route.fulfill({ json: snapshot })
    if (path === '/api/source-files') return route.fulfill({ json: { files: [] } })
    if (path === '/api/workspace/preferences') return route.fulfill({ json: route.request().postDataJSON() })
    if (path === '/api/transcriptions/success') return route.fulfill({ json: success })
    if (path === '/api/transcriptions/failed') return route.fulfill({ json: failed })
    return route.fulfill({ status: 500, json: { statusMessage: `Unexpected request: ${path}` } })
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByLabel('Timeline viewport', { exact: true })).toBeVisible()
  const frame = page.getByTestId('transcript-timeline-frame')
  const sidebar = page.getByRole('complementary', { name: 'Audio files and history' })
  const height = (await frame.boundingBox())!.height
  const top = (await sidebar.boundingBox())!.y
  await page.getByRole('button', { name: /failed.wav/ }).click()
  await expect(page.getByText(failed.error!)).toBeVisible()
  await expect(page.getByLabel('Timeline unavailable', { exact: true })).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByLabel('Timeline viewport', { exact: true })).toHaveCount(0)
  expect((await frame.boundingBox())!.height).toBe(height)
  expect((await sidebar.boundingBox())!.y).toBe(top)
  await page.getByRole('button', { name: /success.wav/ }).click()
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Timeline unavailable', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Copy text', exact: true })).toBeVisible()
})
