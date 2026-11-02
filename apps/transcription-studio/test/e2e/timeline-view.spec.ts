import { expect, test } from '@playwright/test'
import { mockReview } from './timelineFixture'

test('timeline view survives refresh and resets for a different selection', async ({ page }) => {
  const unexpected = await mockReview(page, 'workspace')
  const expand = page.getByRole('button', { name: 'Expand timeline to time scale', exact: true })
  const fit = page.getByRole('button', { name: 'Fit timeline to width', exact: true })
  await expand.click()
  await page.reload()
  await expect(fit).toHaveAttribute('aria-pressed', 'true')
  await fit.click()
  await page.reload()
  await expect(expand).toHaveAttribute('aria-pressed', 'false')

  // A saved expansion for another transcription must not leak into this one.
  await page.evaluate(() => localStorage.setItem('studio.timeline-view', JSON.stringify({ identity: 'job:another', expanded: true })))
  await page.reload()
  await expect(expand).toHaveAttribute('aria-pressed', 'false')
  await expand.click()
  await page.getByRole('tab', { name: 'Recordings', exact: true }).click()
  await page.getByLabel('Choose audio file', { exact: true }).setInputFiles({ name: 'new.wav', mimeType: 'audio/wav', buffer: Buffer.from('synthetic') })
  await expect(expand).toHaveAttribute('aria-pressed', 'false')
  expect(unexpected).toEqual([])
})
