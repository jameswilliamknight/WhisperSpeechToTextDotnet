import { expect, test } from '@playwright/test'
import { mockReview, result } from './timelineFixture'
import type { TranscriptSegment, WorkerResult } from '#shared/studio'

const source = { start: 0, end: 12, text: 'Hello there. Another phrase. Final words.' }
const aligned: TranscriptSegment = { ...source, speaker: 'a', alignment: {
  version: 1, source,
  words: [
    { from: 0, to: 5, start: 0.2, end: 1 }, { from: 6, to: 12, start: 1.2, end: 2 },
    { from: 13, to: 20, start: 4.2, end: 5 }, { from: 21, to: 28, start: 5.2, end: 6 },
    { from: 29, to: 34, start: 8.2, end: 9 }, { from: 35, to: 41, start: 9.2, end: 10 },
  ],
} }
const review: WorkerResult = {
  ...result, segments: [aligned],
  turns: [{ start: 0, end: 4, speaker: 'a' }, { start: 4, end: 8, speaker: 'a' }, { start: 8, end: 12, speaker: 'b' }],
}

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: an A/B/A change inside one sentence has matching passage labels and playback colours`, async ({ page }) => {
    const source = { start: 0, end: 4.74, text: 'Alpha beta gamma.' }
    const unexpected = await mockReview(page, surface, {
      ...result, segments: [{ ...source, speaker: 'a', alignment: { version: 1, source, words: [
        { from: 0, to: 5, start: 0.1, end: 0.9 }, { from: 6, to: 10, start: 1.5, end: 1.8 }, { from: 11, to: 17, start: 2.3, end: 4 },
      ] } }], turns: [{ start: 0, end: 1.449, speaker: 'a' }, { start: 1.131, end: 2.159, speaker: 'b' }, { start: 1.851, end: 4.939, speaker: 'a' }],
    })
    const list = page.getByRole('list', { name: surface === 'workspace' ? 'Transcript passages' : 'Transcript segments' })
    const rows = list.getByRole('listitem')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('Speaker 1')
    await expect(rows.nth(1)).toContainText('Speaker 2')
    await expect(rows.nth(2)).toContainText('Speaker 1')
    await rows.nth(1).getByRole('button', { name: 'Seek to 0:01', exact: true }).click()
    const highlight = rows.nth(1).locator('[data-playback-highlight]')
    await expect(highlight).toHaveText('beta')
    const colour = await rows.nth(1).getByText('Speaker 2', { exact: true }).evaluate(element => getComputedStyle(element).color)
    await expect(highlight).toHaveCSS('color', colour)
    await expect(rows.nth(0).locator('[data-playback-highlight]')).toHaveCount(0)
    await expect(rows.nth(2).locator('[data-playback-highlight]')).toHaveCount(0)
    expect(unexpected).toEqual([])
  })

  test(`${surface}: neutral context, phrase preview and paused/playing highlights share real media time`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const unexpected = await mockReview(page, surface, review)
    const list = page.getByRole('list', { name: surface === 'workspace' ? 'Transcript passages' : 'Transcript segments' })
    const playback = list.locator('[data-playback-highlight]')
    const first = page.getByRole('button', { name: 'Seek to Speaker 1, 0:00 to 0:04', exact: true })
    const second = page.getByRole('button', { name: 'Seek to Speaker 1, 0:04 to 0:08', exact: true })
    await expect(playback).toHaveText('Hello there.')
    const neutral = list.getByTestId('highlighted-transcript').first()
    const neutralColour = await neutral.evaluate(element => getComputedStyle(element).color)
    const phraseColour = await playback.evaluate(element => getComputedStyle(element).color)
    expect(neutralColour).not.toBe(phraseColour)
    await second.hover()
    const tooltip = page.getByTestId('turn-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip.locator('[data-preview-highlight]')).toHaveText('Another phrase.')
    await expect(tooltip.locator('[data-playback-highlight]')).toHaveText('Hello there.')
    await expect(playback).toHaveText('Hello there.')
    expect(await page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(0)
    await second.click()
    await expect(playback).toHaveText('Another phrase.')
    expect(await page.locator('audio').evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
    await first.focus()
    await expect(tooltip.locator('[data-preview-highlight]')).toHaveText('Hello there.')
    await expect(tooltip.locator('[data-playback-highlight]')).toHaveText('Another phrase.')
    await expect(playback).toHaveText('Another phrase.')
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect.poll(() => page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(4)
    // A boundary crossed by actual audio playback, not a mocked time property.
    await expect(playback).toHaveText('Final words.', { timeout: 10000 })
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    await expect(playback).toHaveText('Final words.')
    expect(await playback.evaluate(element => getComputedStyle(element).color)).not.toBe(phraseColour)
    await first.click()
    await expect(playback).toHaveText('Hello there.')
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}

test('workspace: legacy and stale alignment stay neutral, including tooltip previews', async ({ page }) => {
  const stale = { ...aligned, text: `${aligned.text} Edited.` }
  const unexpected = await mockReview(page, 'workspace', { ...review, segments: [stale] })
  const list = page.getByRole('list', { name: 'Transcript passages' })
  await expect(list.locator('[data-playback-highlight]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Seek to Speaker 1, 0:04 to 0:08', exact: true }).hover()
  await expect(page.getByTestId('turn-tooltip')).toBeVisible()
  await expect(page.getByTestId('turn-tooltip').locator('[data-preview-highlight]')).toHaveCount(0)
  await expect(list.getByText(stale.text, { exact: true })).toBeVisible()
  expect(unexpected).toEqual([])
})

test('workspace: speaker renames preserve highlight colours and copying stays coherent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { sessionStorage.setItem('synthetic-copy', text) } } })
  })
  const unexpected = await mockReview(page, 'workspace', review)
  const list = page.getByRole('list', { name: 'Transcript passages' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('listitem').nth(0)).toContainText('Hello there. Another phrase.')
  await expect(list.getByRole('listitem').nth(1)).toContainText('Final words.')
  await expect(list.getByRole('listitem').nth(1)).toContainText('Speaker 2')
  const colour = await list.locator('[data-playback-highlight]').evaluate(element => getComputedStyle(element).color)
  await list.getByRole('button', { name: 'Rename Speaker 1', exact: true }).click()
  await page.getByLabel('Speaker name', { exact: true }).fill('Reader')
  await page.getByRole('button', { name: 'Save name', exact: true }).click()
  await expect(list.getByText('Reader', { exact: true })).toBeVisible()
  await expect(list.locator('[data-playback-highlight]')).toHaveCSS('color', colour)
  await page.getByRole('button', { name: 'Seek to Reader, 0:04 to 0:08', exact: true }).hover()
  const tooltip = page.getByTestId('turn-tooltip')
  await expect(tooltip.locator('[data-preview-highlight]')).toHaveText('Another phrase.')
  await expect(tooltip.locator('[data-preview-highlight]')).toHaveCSS('color', colour)
  await page.getByRole('button', { name: 'Copy text', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toBe('Reader: Hello there. Another phrase.\nSpeaker 2: Final words.\n')
  await page.reload()
  await expect(list.getByText('Reader', { exact: true })).toBeVisible()
  await expect(list.locator('[data-playback-highlight]')).toHaveCSS('color', colour)
  expect(unexpected).toEqual([])
})
