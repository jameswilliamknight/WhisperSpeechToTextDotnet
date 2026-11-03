import { expect, test } from '@playwright/test'
import { completed, fixture, mockWorkspace } from './workspaceFixture'

test('recording rows show distinct status icons and friendly time with exact timestamps', async ({ page }) => {
  const snapshot = fixture(), now = new Date('2026-11-02T07:00:00Z')
  await page.clock.setFixedTime(now)
  snapshot.jobs = (['succeeded', 'failed', 'cancelled', 'interrupted'] as const).map((status, index) => ({
    id: `history-${index}`, name: `recording-${index}.wav`, status, phase: 'Complete',
    startedAt: new Date(now.getTime() - (index + 1) * 5 * 60_000).toISOString(),
  }))
  await mockWorkspace(page, snapshot)
  await page.goto('/')
  const history = page.getByRole('list', { name: 'Recording files', exact: true })
  for (const [index, label] of ['Succeeded', 'Failed', 'Cancelled', 'Interrupted'].entries()) {
    const row = history.getByRole('listitem').filter({ hasText: `recording-${index}.wav` })
    await expect(row.getByRole('img', { name: label, exact: true })).toBeVisible()
    await expect(row.locator('time')).toHaveText(`${(index + 1) * 5} minutes ago`)
    await expect(row.locator('time')).toHaveAttribute('datetime', snapshot.jobs[index]!.startedAt)
    await expect(row.locator('time')).toHaveAttribute('title', /2026/)
  }
  await expect(history.getByRole('img', { name: 'Succeeded', exact: true })).toHaveClass(/text-green-400/)
  await expect(history.getByRole('img', { name: 'Failed', exact: true })).toHaveClass(/text-red-400/)
})

test('recordings fills the transcript column height and scrolls internally', async ({ page }) => {
  const snapshot = fixture()
  snapshot.jobs = Array.from({ length: 30 }, (_, index) => ({
    id: `synthetic-job-${index}`, name: `sample-${index}.wav`, status: 'succeeded' as const, phase: 'Complete',
    startedAt: new Date(2026, 10, 2, 12, index).toISOString(),
  }))
  await mockWorkspace(page, snapshot)
  await page.goto('/')
  const recordings = page.getByRole('region', { name: 'Recordings', exact: true })
  const list = recordings.getByRole('list', { name: 'Recording files', exact: true })
  await expect.poll(() => list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const heights = await page.evaluate(() => ({
    recordings: document.querySelector('section[aria-labelledby="recordings-heading"]')!.getBoundingClientRect().height,
    transcript: document.querySelector('section[aria-labelledby="transcript-heading"]')!.getBoundingClientRect().height,
  }))
  expect(Math.abs(heights.recordings - heights.transcript)).toBeLessThan(2)
})

test('transcript uses available height and lets the page scroll only in short desktop windows', async ({ page }) => {
  const snapshot = fixture()
  snapshot.jobs = [completed]; snapshot.preferences.selectedJobId = completed.id
  await mockWorkspace(page, snapshot)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('Synthetic transcript.', { exact: true })).toBeVisible()
  const geometry = () => page.evaluate(() => {
    const main = document.querySelector('main')!, list = document.querySelector('ol[aria-label="Transcript passages"]')! as HTMLElement
    return { mainScrolls: main.scrollHeight > main.clientHeight, listHeight: list.clientHeight }
  })
  await expect.poll(geometry).toMatchObject({ mainScrolls: false })
  expect((await geometry()).listHeight).toBeGreaterThanOrEqual(320)
  await page.setViewportSize({ width: 1440, height: 754 })
  await expect.poll(geometry).toMatchObject({ mainScrolls: true })
  expect((await geometry()).listHeight).toBeGreaterThanOrEqual(320)
})
