import { expect, test } from '@playwright/test'
import { mockRecordings } from './recordingsFixture'

test('progress replaces timeline/text, holds geometry, and durable completion waits for acknowledgement', async ({ page }) => {
  const mock = await mockRecordings(page)
  const warnings: string[] = []
  page.on('pageerror', error => warnings.push(error.message))
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text()) })
  await page.goto('/')
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retranscribe alpha.wav', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Retranscribe', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: 'Transcription progress' })).toBeVisible()
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toHaveCount(0)
  await expect(page.locator('audio')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: /^Transcribing$/ })).toBeVisible()
  const elapsed = page.getByTestId('progress-elapsed'), percentage = page.getByTestId('progress-percentage'), duration = page.getByTestId('progress-audio-length')
  const initial = await Promise.all([elapsed.boundingBox(), percentage.boundingBox(), duration.boundingBox()])
  const active = mock.state.jobs[0]!
  active.startedAt = new Date(Date.now() - 3_659_000).toISOString()
  active.durationSeconds = 3526
  active.progress = { stage: 'Complete', percent: 100, updatedAt: new Date().toISOString() }
  await expect(page.getByRole('status').filter({ hasText: /^Finishing$/ })).toBeVisible()
  await expect(percentage).toHaveText('100%')
  await expect(duration).toHaveText('58:46')
  await expect(page.getByRole('button', { name: 'View transcript', exact: true })).toHaveCount(0)
  const changed = await Promise.all([elapsed.boundingBox(), percentage.boundingBox(), duration.boundingBox()])
  for (let index = 0; index < initial.length; index++) {
    expect(changed[index]!.width).toBeCloseTo(initial[index]!.width, 1)
    expect(changed[index]!.x).toBeCloseTo(initial[index]!.x, 1)
  }
  mock.finish('succeeded')
  await expect(page.getByRole('button', { name: 'View transcript', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel transcription', exact: true })).toHaveCount(0)
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toHaveCount(0)
  await expect(elapsed).toHaveText('0:42')
  await page.getByRole('button', { name: 'View transcript', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: 'Transcription progress' })).toHaveCount(0)
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible()
  expect(mock.state.preferences.selectedJobId).toBe(active.id)
  const selected = page.getByRole('list', { name: 'Recording files', exact: true }).getByRole('listitem').filter({ hasText: 'alpha.wav' })
  await selected.getByRole('button').first().focus()
  await expect(selected.getByRole('button').first()).toHaveCSS('outline-style', 'none')
  expect(mock.requests.unexpected).toEqual([])
  expect(warnings).toEqual([])
})
