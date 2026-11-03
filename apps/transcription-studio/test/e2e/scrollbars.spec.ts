import { expect, test } from '@playwright/test'
import type { TranscriptionDetail } from '#shared/workspace'
import { mockRecordings } from './recordingsFixture'

test('column scrollbars fade independently on area hover, reserve space and respect reduced motion', async ({ page }) => {
  const mock = await mockRecordings(page)
  const good = mock.state.jobs[0] as TranscriptionDetail
  good.result = { ...good.result!, segments: Array.from({ length: 40 }, (_, index) => ({
    start: index * 4, end: index * 4 + 3, speaker: index % 2 ? 'b' : 'a', text: `Synthetic passage ${index + 1} contains enough text to read.`,
  })) }
  mock.state.jobs.push(...Array.from({ length: 40 }, (_, index) => ({ ...good, id: `more-${index}`, recordingId: `more-recording-${index}`, name: `extra-${index}.wav` })))
  await page.goto('/')
  const recordings = page.getByRole('list', { name: 'Recording files', exact: true })
  const transcript = page.getByRole('list', { name: 'Transcript passages', exact: true })
  const opacity = (target: typeof recordings) => target.evaluate(element => Number(getComputedStyle(element).getPropertyValue('--studio-scrollbar-opacity')))
  await expect.poll(() => recordings.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await expect.poll(() => transcript.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await page.getByRole('navigation', { name: 'Main navigation' }).hover()
  await expect.poll(() => opacity(recordings)).toBe(0)
  await expect.poll(() => opacity(transcript)).toBe(0)
  const width = await recordings.evaluate(element => element.clientWidth)
  await expect(recordings).toHaveCSS('scrollbar-gutter', 'stable')
  await expect(transcript).toHaveCSS('scrollbar-gutter', 'stable')
  const samples = recordings.evaluate(element => new Promise<number[]>(resolve => {
    const values: number[] = [], started = performance.now()
    function sample(now: number) {
      values.push(Number(getComputedStyle(element).getPropertyValue('--studio-scrollbar-opacity')))
      if (now - started < 350) requestAnimationFrame(sample)
      else resolve(values)
    }
    requestAnimationFrame(sample)
  }))
  await page.getByRole('heading', { name: 'Recordings', exact: true }).hover()
  expect((await samples).some(value => value > 0 && value < 1)).toBe(true)
  await expect.poll(() => opacity(recordings)).toBe(1)
  await expect.poll(() => opacity(transcript)).toBe(0)
  expect(await recordings.evaluate(element => element.clientWidth)).toBe(width)
  await transcript.hover()
  await expect.poll(() => opacity(recordings)).toBe(0)
  await expect.poll(() => opacity(transcript)).toBe(1)
  await expect(page.locator('section[aria-labelledby="transcript-heading"]')).toHaveCSS('transition-duration', '0.2s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('section[aria-labelledby="transcript-heading"]')).toHaveCSS('transition-duration', '0s')
  expect(mock.requests.unexpected).toEqual([])
})
