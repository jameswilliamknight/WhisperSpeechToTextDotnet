import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { TranscriptionDetail, WorkspaceSnapshot } from '../../shared/workspace'
import { mockSourceWatch } from './sourceWatchMock'

function fixture(): WorkspaceSnapshot {
  return {
    settings: { sourceDirectory: '/synthetic/source', workingDirectory: '/synthetic/work', outputDirectory: '/synthetic/output' },
    preferences: { selectedJobId: null, copyWithSpeakers: true }, jobs: [], activeJobId: null,
    engine: { available: true },
  }
}
const completed: TranscriptionDetail = {
  id: 'synthetic-job', name: 'sample.wav', status: 'succeeded', phase: 'Complete', startedAt: '2026-11-02T00:00:00Z', audioAvailable: false,
  result: {
    segments: [{ start: 0, end: 2, text: 'Synthetic transcript.', speaker: 'A' }], turns: [{ start: 0, end: 2, speaker: 'A' }],
    stages: {}, metadata: { runtime: 'synthetic', models: [], backend: 'whisper' }, warnings: [],
  },
}

async function mockWorkspace(page: Page, snapshot: WorkspaceSnapshot) {
  await mockSourceWatch(page)
  const requests = { metadata: 0, details: 0, starts: [] as unknown[], uploads: [] as { name: string | null; type: string | undefined }[], speakers: [] as Record<string, string>[] }
  let current: TranscriptionDetail = { ...completed }
  // This catch-all prevents any unmocked request from touching the owner's real workspace.
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/workspace') { requests.metadata++; await route.fulfill({ json: snapshot }); return }
    if (url.pathname === '/api/workspace/preferences') { snapshot.preferences = request.postDataJSON(); await route.fulfill({ json: snapshot.preferences }); return }
    if (url.pathname === '/api/workspace/settings') { snapshot.settings = request.postDataJSON(); await route.fulfill({ json: snapshot.settings }); return }
    if (url.pathname === '/api/transcriptions/synthetic-job/speakers') {
      const { speakerNames } = request.postDataJSON() as { speakerNames: Record<string, string> }
      requests.speakers.push(speakerNames)
      current = { ...current, speakerNames }
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

test('upload starts only on Transcribe, polls metadata, refreshes terminal detail and copies privately', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { sessionStorage.setItem('synthetic-copy', text) } } })
  })
  const snapshot = fixture()
  const mock = await mockWorkspace(page, snapshot)
  await page.goto('/')
  await page.getByLabel('Choose audio file', { exact: true }).setInputFiles({ name: 'sample & test.wav', mimeType: 'audio/wav', buffer: Buffer.from('synthetic') })
  await expect(page.getByText('Selected: sample & test.wav')).toBeVisible()
  expect(mock.requests.uploads).toHaveLength(0)
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel transcription' })).toBeVisible()
  await page.getByRole('tab', { name: 'Transcriptions', exact: true }).click()
  await expect(page.getByRole('button', { name: /sample & test\.wav/ }).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('progressbar', { name: 'Transcription progress' })).toHaveAttribute('aria-valuenow', '42')
  await expect(page.getByRole('status').filter({ hasText: 'Transcribing audio · 42%' })).toBeVisible()
  await expect.poll(() => mock.requests.metadata).toBeGreaterThanOrEqual(4)
  expect(mock.requests.details).toBe(1)
  expect(mock.requests.uploads).toEqual([{ name: 'sample & test.wav', type: 'application/octet-stream' }])
  mock.complete()
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  expect(mock.requests.details).toBe(2)
  await page.getByRole('button', { name: 'Copy text' }).hover()
  await expect(page.getByText('Copy full transcript with speaker labels', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Copy text' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Speaker-labelled text copied.' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toBe('Speaker 1: Synthetic transcript.\n')
  await page.getByRole('switch', { name: 'Copy with speaker labels' }).click()
  await page.getByRole('button', { name: 'Copy text' }).hover()
  await expect(page.getByText('Copy full transcript without speaker labels', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Copy text' }).click()
  await expect(page.getByText('Plain text copied.')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toBe('Synthetic transcript.\n')
  await page.reload()
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  expect(snapshot.preferences).toEqual({ selectedJobId: 'synthetic-job', copyWithSpeakers: false })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('speaker rename updates passages, timeline and clipboard and survives reload', async ({ page }) => {
  const snapshot = fixture()
  snapshot.jobs = [completed]
  snapshot.preferences.selectedJobId = completed.id
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { sessionStorage.setItem('synthetic-copy', text) } } })
  })
  const mock = await mockWorkspace(page, snapshot)
  await page.goto('/')
  const passage = page.locator('ol[aria-label="Transcript passages"] li').first()
  await passage.getByText('Speaker 1', { exact: true }).hover()
  const rename = passage.getByRole('button', { name: 'Rename Speaker 1' })
  await expect(rename).toHaveCSS('opacity', '1')
  await rename.click()
  await expect(page.getByRole('dialog', { name: 'Rename speaker' })).toBeVisible()
  await page.getByLabel('Speaker name').fill('Alice')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(passage.getByText('Alice', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Alice timeline', exact: true })).toBeVisible()
  expect(mock.requests.speakers).toEqual([{ A: 'Alice' }])
  await page.getByRole('button', { name: 'Copy text' }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toBe('Alice: Synthetic transcript.\n')
  await page.reload()
  await expect(page.locator('ol[aria-label="Transcript passages"]').getByText('Alice', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Alice timeline', exact: true })).toBeVisible()
})

test('source selection uses a leaf name and cancellation leaves history intact', async ({ page }) => {
  const mock = await mockWorkspace(page, fixture())
  await page.goto('/')
  const recent = page.getByRole('tab', { name: 'Transcriptions', exact: true })
  await recent.click()
  await expect(recent).toHaveAttribute('aria-selected', 'true')
  await recent.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Recordings', exact: true })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Recordings', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: /directory.wav/ }).click()
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel transcription' })).toBeVisible()
  expect(mock.requests.starts).toEqual([{ sourceName: 'directory.wav' }])
  await page.getByRole('button', { name: 'Cancel transcription' }).click()
  await expect(page.getByRole('button', { name: 'Cancel transcription' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Transcriptions', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()
  await expect(page.getByText('No transcript available.')).toBeVisible()
})

test('recordings contains the chooser and refreshes automatically on folder notifications', async ({ page }) => {
  await mockWorkspace(page, fixture())
  let names = ['first.wav']
  await page.route('**/api/source-files', route => route.fulfill({ json: { files: names.map(name => ({ name, bytes: 100, modifiedAt: '2026-11-02T00:00:00Z' })) } }))
  await page.goto('/')
  const recordings = page.getByRole('tabpanel', { name: 'Recordings', exact: true })
  await expect(recordings.getByRole('button', { name: 'Choose file', exact: true })).toBeVisible()
  await expect(recordings.getByRole('button', { name: /first.wav/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'List files', exact: true })).toHaveCount(0)
  names = ['new.wav']
  await page.evaluate(() => window.dispatchEvent(new Event('synthetic-recordings-change')))
  await expect(recordings.getByRole('button', { name: /new.wav/ })).toBeVisible()
  await expect(recordings.getByRole('button', { name: /first.wav/ })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Transcriptions', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeHidden()
})

test('settings validates explicit saves and restores saved locations after reload', async ({ page }) => {
  const snapshot = fixture()
  await mockWorkspace(page, snapshot)
  await page.goto('/settings')
  for (const label of ['Recordings folder (optional)', 'Working directory', 'Transcript output directory']) {
    const field = page.getByLabel(label, { exact: true })
    await field.evaluate(input => {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', '  “\'/synthetic/James\'s Audio\'”  ')
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    })
    await expect(field).toHaveValue('/synthetic/James\'s Audio')
  }
  await page.getByLabel('Transcript output directory').fill('/synthetic/output')
  await page.getByLabel('Working directory', { exact: true }).fill('relative/path')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('alert')).toContainText('Use absolute directory paths')
  expect(snapshot.settings.workingDirectory).toBe('/synthetic/work')
  await page.getByLabel('Recordings folder (optional)').fill('')
  await page.getByLabel('Working directory', { exact: true }).fill('/synthetic/new-work')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Working directory', { exact: true })).toHaveValue('/synthetic/new-work')
  await expect(page.getByLabel('Recordings folder (optional)')).toHaveValue('')
})

test('missing engine and failed API requests are visible', async ({ page }) => {
  const snapshot = fixture()
  snapshot.engine = { available: false, reason: 'Synthetic missing model' }
  await mockWorkspace(page, snapshot)
  await page.goto('/')
  await expect(page.getByText('Synthetic missing model')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeDisabled()
  await page.route('**/api/workspace/settings', route => route.fulfill({ status: 400, json: { statusMessage: 'Directories must not overlap.' } }))
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Directories must not overlap.')).toBeVisible()
})

test('drag/drop selects audio, invalid replacement clears selection, and upload failures are visible', async ({ page }) => {
  const mock = await mockWorkspace(page, fixture())
  await page.goto('/')
  const dropZone = page.getByRole('region', { name: 'Audio file', exact: true })
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer()
    data.items.add(new File(['synthetic'], 'dropped.wav', { type: 'audio/wav' }))
    return data
  })
  const initialHeight = (await dropZone.boundingBox())!.height
  await expect(page.getByText('Drop audio to select')).toHaveCount(0)
  await dropZone.dispatchEvent('dragenter', { dataTransfer: transfer })
  await expect(page.getByText('Drop audio to select')).toBeVisible()
  expect((await dropZone.boundingBox())!.height).toBe(initialHeight)
  await dropZone.dispatchEvent('dragleave', { dataTransfer: transfer })
  await expect(page.getByText('Drop audio to select')).toHaveCount(0)
  await dropZone.dispatchEvent('dragenter', { dataTransfer: transfer })
  await dropZone.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByText('Drop audio to select')).toHaveCount(0)
  await expect(page.getByText('Selected: dropped.wav')).toBeVisible()
  expect(mock.requests.uploads).toHaveLength(0)
  await page.getByLabel('Choose audio file', { exact: true }).setInputFiles({ name: 'not-audio.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic') })
  await expect(page.getByRole('alert')).toContainText('Unsupported audio file')
  await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeDisabled()
  await dropZone.dispatchEvent('drop', { dataTransfer: transfer })
  await page.route('**/api/transcriptions/upload?*', route => route.fulfill({ status: 413, json: { statusMessage: 'Audio exceeds the upload limit.' } }))
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click()
  await expect(page.getByText('Audio exceeds the upload limit.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeEnabled()
})

test('history rows show distinct status icons and friendly time with exact timestamps on hover', async ({ page }) => {
  const snapshot = fixture()
  const now = new Date('2026-11-02T07:00:00Z')
  await page.clock.setFixedTime(now)
  snapshot.jobs = (['succeeded', 'failed', 'cancelled', 'interrupted'] as const).map((status, index) => ({
    id: `history-${index}`, name: `recording-${index}.wav`, status, phase: 'Complete',
    startedAt: new Date(now.getTime() - (index + 1) * 5 * 60_000).toISOString(),
  }))
  await mockWorkspace(page, snapshot)
  await page.goto('/')
  const history = page.getByRole('region', { name: 'Transcriptions', exact: true })
  for (const [index, label] of ['Succeeded', 'Failed', 'Cancelled', 'Interrupted'].entries()) {
    const row = history.getByRole('button', { name: new RegExp(`recording-${index}`) })
    await expect(row.getByRole('img', { name: label, exact: true })).toBeVisible()
    await expect(row.locator('time')).toHaveText(`${(index + 1) * 5} minutes ago`)
    await expect(row.locator('time')).toHaveAttribute('datetime', snapshot.jobs[index]!.startedAt)
    await expect(row.locator('time')).toHaveAttribute('title', /2026/)
    await expect(row.getByText(label, { exact: true })).toHaveCount(0)
  }
  await expect(history.getByRole('img', { name: 'Succeeded', exact: true })).toHaveClass(/text-green-400/)
  await expect(history.getByRole('img', { name: 'Failed', exact: true })).toHaveClass(/text-red-400/)
})

test('transcription tabs fill the transcript column height and scroll within their own list', async ({ page }) => {
  const snapshot = fixture()
  snapshot.jobs = Array.from({ length: 30 }, (_, index) => ({
    id: `synthetic-job-${index}`, name: `sample-${index}.wav`, status: 'succeeded' as const, phase: 'Complete',
    startedAt: new Date(2026, 10, 2, 12, index).toISOString(),
  }))
  await mockWorkspace(page, snapshot)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Transcriptions', exact: true })).toBeVisible()
  const history = page.locator('section[aria-labelledby="history-heading"]')
  const list = history.locator('ul')
  await expect.poll(() => list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const heights = await page.evaluate(() => ({
    tabs: document.querySelector('section[aria-label="Recordings"]')!.getBoundingClientRect().height,
    transcript: document.querySelector('section[aria-labelledby="transcript-heading"]')!.getBoundingClientRect().height,
  }))
  expect(Math.abs(heights.tabs - heights.transcript)).toBeLessThan(2)
})

test('transcript uses available height and lets the page scroll only when the viewport is short', async ({ page }) => {
  const snapshot = fixture()
  snapshot.jobs = [completed]
  snapshot.preferences.selectedJobId = completed.id
  await mockWorkspace(page, snapshot)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  const geometry = () => page.evaluate(() => {
    const main = document.querySelector('main')!
    const list = document.querySelector('ol[aria-label="Transcript passages"]')! as HTMLElement
    return { mainScrolls: main.scrollHeight > main.clientHeight, listHeight: list.clientHeight }
  })
  await expect.poll(geometry).toMatchObject({ mainScrolls: false })
  expect((await geometry()).listHeight).toBeGreaterThanOrEqual(320)
  await page.setViewportSize({ width: 1440, height: 754 })
  await expect.poll(geometry).toMatchObject({ mainScrolls: true })
  expect((await geometry()).listHeight).toBeGreaterThanOrEqual(320)
})

test('clipboard permission failures offer visible feedback without losing the transcript', async ({ page }) => {
  const snapshot = fixture()
  snapshot.jobs = [completed]
  snapshot.preferences.selectedJobId = completed.id
  await mockWorkspace(page, snapshot)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Synthetic permission rejection') } } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Copy text' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not copy to the clipboard')
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
})
