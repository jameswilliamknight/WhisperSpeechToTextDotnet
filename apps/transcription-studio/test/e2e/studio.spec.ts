import { expect, test } from '@playwright/test'
import type { BenchmarkRun, StudioSnapshot } from '../../shared/studio'
import { fixture, mockWorkspace } from './workspaceFixture'

test.beforeEach(async ({ page }) => { await mockWorkspace(page, fixture()) })

const fixtureRun: BenchmarkRun = {
  id: '00000000-0000-0000-0000-000000000001', backend: 'nemo', preset: 'smoke',
  status: 'succeeded', phase: 'Complete', startedAt: '2026-11-02T00:00:00Z',
  durationSeconds: 90, wallSeconds: 3, realTimeFactor: 30, integrityVerified: true,
  result: {
    segments: [{ start: 0, end: 2, text: 'SYNTHETIC PRIVATE FIXTURE', speaker: 'a' }],
    turns: [{ start: 0, end: 2, speaker: 'a' }, { start: 1, end: 3, speaker: 'b' }, { start: 4, end: 5, speaker: 'a' }],
    stages: {}, metadata: { runtime: 'synthetic', models: ['synthetic'], backend: 'test' }, warnings: [],
  },
}

test('private review, correct speed, desktop layout, and start/cancel flow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const snapshot: StudioSnapshot = {
    source: { prepared: true, label: 'Synthetic recording', durationSeconds: 90, bytes: 1000, sha256: 'test', verifiedAt: '2026-11-02T00:00:00Z' },
    backends: [{ id: 'nemo', name: 'NeMo Speech', acceleration: 'Metal', description: 'Synthetic fixture adapter', available: true }],
    runs: [{ ...fixtureRun }], activeRunId: null,
  }
  // Browser requests never read or start work on the owner's real recording in this spec.
  await page.route('**/api/studio', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/audio', route => route.fulfill({ status: 404 }))
  await page.route('**/api/runs', async route => {
    const run = { ...fixtureRun, result: undefined, status: 'running' as const, phase: 'Running' }
    snapshot.runs = [run]; snapshot.activeRunId = run.id
    await route.fulfill({ status: 202, json: run })
  })
  await page.route('**/api/runs/*/cancel', async route => {
    snapshot.runs[0]!.status = 'cancelled'; snapshot.activeRunId = null
    await route.fulfill({ json: { cancelled: true } })
  })
  await page.goto('/benchmarks')
  await expect(page.getByRole('heading', { name: 'Benchmark runs' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '30.00×' })).toBeVisible()
  await expect(page.getByText('SYNTHETIC PRIVATE FIXTURE')).toBeVisible()
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Speaker 1 timeline', exact: true })).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Speaker 2 timeline', exact: true })).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Speaker 1 timeline', exact: true }).getByRole('button', { name: /^Seek to Speaker 1/ })).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Start benchmark' }).click()
  await page.getByRole('button', { name: 'Cancel active run' }).click()
  await expect(page.getByRole('cell', { name: 'cancelled', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('speaker rename updates the benchmark review and persists in the run', async ({ page }) => {
  const snapshot: StudioSnapshot = {
    source: { prepared: true, label: 'Synthetic recording', durationSeconds: 90, bytes: 1000, sha256: 'test', verifiedAt: '2026-11-02T00:00:00Z' },
    backends: [{ id: 'nemo', name: 'NeMo Speech', acceleration: 'Metal', description: 'Synthetic fixture adapter', available: true }],
    runs: [{ ...fixtureRun }], activeRunId: null,
  }
  await page.route('**/api/studio', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/audio', route => route.fulfill({ status: 404 }))
  await page.route('**/api/runs/*/speakers', async route => {
    const body = route.request().postDataJSON() as { speakerNames: Record<string, string> }
    snapshot.runs[0] = { ...snapshot.runs[0]!, speakerNames: body.speakerNames }
    await route.fulfill({ json: body.speakerNames })
  })
  await page.goto('/benchmarks')
  const labels = page.getByLabel('Timeline speakers', { exact: true })
  await labels.getByText('Speaker 1', { exact: true }).hover()
  const rename = labels.getByRole('button', { name: 'Rename Speaker 1' })
  await expect(rename).toHaveCSS('opacity', '1')
  await rename.click()
  await page.getByLabel('Speaker name').fill('Alice')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('group', { name: 'Alice timeline', exact: true })).toBeVisible()
  await expect(page.locator('ol[aria-label="Transcript segments"]').getByText('Alice', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: 'Alice timeline', exact: true })).toBeVisible()
})

test('API rejects cross-origin mutations, rebinding hosts and browser-supplied paths', async ({ request }) => {
  const forbidden = await request.post('/api/runs', {
    headers: { origin: 'https://untrusted.invalid' }, data: { backend: 'nemo', preset: 'smoke' },
  })
  expect(forbidden.status()).toBe(403)
  const host = await request.get('/api/studio', { headers: { host: 'untrusted.invalid' } })
  expect(host.status()).toBe(403)
  const path = await request.post('/api/runs', {
    headers: { origin: 'http://localhost:42076' }, data: { backend: 'nemo', preset: 'smoke', inputPath: '/not-allowed' },
  })
  expect(path.status()).toBe(400)
})
