import { expect, test } from '@playwright/test'
import type { TranscriptionDetail } from '#shared/workspace'
import { mockRecordings } from './recordingsFixture'

test('a new recording failure preserves timeline geometry and an existing transcript restores controls', async ({ page }) => {
  const mock = await mockRecordings(page)
  const success = mock.state.jobs[0] as TranscriptionDetail
  success.result = { ...success.result!, turns: [{ start: 0, end: 2, speaker: 'A' }, { start: 2, end: 4, speaker: 'B' }, { start: 4, end: 6, speaker: 'C' }] }
  await page.goto('/')
  await expect(page.getByLabel('Timeline viewport', { exact: true })).toBeVisible()
  const frame = page.getByTestId('transcript-timeline-frame')
  const sidebar = page.getByRole('complementary', { name: 'Audio files and history' })
  const height = (await frame.boundingBox())!.height, top = (await sidebar.boundingBox())!.y
  await page.getByRole('button', { name: 'Transcribe new.wav', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: 'Transcription progress' })).toBeVisible()
  mock.finish('failed')
  await expect(page.locator('section[aria-labelledby="transcript-heading"]').getByText('Synthetic retry failed', { exact: true })).toBeVisible()
  // Loading and idle placeholders coexist briefly during the leave transition.
  const placeholder = page.getByLabel('Timeline unavailable', { exact: true })
  await expect(placeholder).toHaveCount(1)
  await expect(placeholder).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByLabel('Timeline viewport', { exact: true })).toHaveCount(0)
  await expect.poll(() => frame.boundingBox().then(box => box!.height)).toBe(height)
  await expect.poll(() => sidebar.boundingBox().then(box => box!.y)).toBe(top)
  const goodRow = page.getByRole('listitem').filter({ hasText: 'alpha.wav' })
  await goodRow.getByRole('button').first().click()
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Timeline unavailable', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Copy text', exact: true })).toBeVisible()
  expect(mock.requests.unexpected).toEqual([])
})
