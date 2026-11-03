import { expect, test } from '@playwright/test'
import type { TranscriptSegment } from '#shared/studio'
import { mockReview, result } from './timelineFixture'

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: short same-speaker gaps remain one readable passage with consistent highlighting`, async ({ page }) => {
    const errors: string[] = [], failed: number[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', response => { if (response.status() >= 400) failed.push(response.status()) })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { sessionStorage.setItem('synthetic-copy', text) } } })
    })
    const segments: TranscriptSegment[] = [
      { start: 0, end: 1, text: 'Alpha', speaker: 'a' },
      { start: 1.2, end: 1.8, text: 'and', speaker: 'b' },
      { start: 2, end: 4, text: 'omega.', speaker: 'a' },
    ].map(source => ({ ...source, alignment: { version: 1, source: { start: source.start, end: source.end, text: source.text }, words: [
      { from: 0, to: source.text.length, start: source.start, end: source.end },
    ] } }))
    const unexpected = await mockReview(page, surface, { ...result, segments, turns: [
      { start: 0, end: 1, speaker: 'a' }, { start: 2, end: 4, speaker: 'a' },
    ] })
    const list = page.getByRole('list', { name: surface === 'workspace' ? 'Transcript passages' : 'Transcript segments' })
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText('Alpha and omega.')
    await expect(list).toContainText('Speaker 1')
    await expect(list.getByText('Unlabelled', { exact: true })).toHaveCount(0)
    const colour = await list.getByText('Speaker 1', { exact: true }).evaluate(element => getComputedStyle(element).color)
    await page.getByRole('button', { name: 'Seek to Speaker 1, 0:02 to 0:04', exact: true }).click()
    const highlight = list.locator('[data-playback-highlight]')
    await expect(highlight).toHaveText('and omega.')
    await expect(highlight).toHaveCSS('color', colour)
    expect(await page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(2)
    if (surface === 'workspace') {
      await page.getByRole('button', { name: 'Copy text', exact: true }).click()
      expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toBe('Speaker 1: Alpha and omega.\n')
    }
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
    expect(failed).toEqual([])
  })
}
