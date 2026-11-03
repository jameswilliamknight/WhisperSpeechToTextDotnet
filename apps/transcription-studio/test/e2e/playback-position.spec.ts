import { expect, test } from '@playwright/test'
import { mockReview } from './timelineFixture'

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: refresh restores paused position and playing refresh resumes`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const unexpected = await mockReview(page, surface)
    const audio = page.locator('audio')
    await page.getByRole('button', { name: 'Seek to Speaker 2, 1:00 to 1:08', exact: true }).click()
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(60)
    // Reload immediately: pagehide must flush without waiting for the throttle.
    await page.reload()
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(60)
    expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
    const list = page.getByRole('list', { name: surface === 'workspace' ? 'Transcript passages' : 'Transcript segments' })
    await expect(list).toContainText('Synthetic second speaker.')
    if (surface === 'workspace') await expect(list.locator('[aria-current="true"]')).toContainText('Synthetic second speaker.')
    if (surface === 'workspace') {
      await page.getByRole('link', { name: 'Settings', exact: true }).click()
      await page.getByRole('link', { name: 'Transcribe', exact: true }).click()
      await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(60)
      expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
    }
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(60.2)
    await page.reload()
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false)
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(60.2)
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    const paused = await audio.evaluate(element => (element as HTMLAudioElement).currentTime)
    await page.reload()
    await expect.poll(async () => Math.abs(await audio.evaluate(element => (element as HTMLAudioElement).currentTime) - paused)).toBeLessThan(0.05)
    expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}

test('oversized saved positions clamp to audio duration', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('studio.playback-position', JSON.stringify({ version: 1, positions: {
    'recording:synthetic-timeline': { seconds: 9999, playing: false },
  } })))
  await mockReview(page, 'workspace')
  await expect.poll(() => page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(180)
  await expect(page.getByText('Audio could not be loaded.', { exact: true })).toHaveCount(0)
})

test('autoplay refusal preserves the restored position without reporting an audio failure', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('studio.playback-position', JSON.stringify({ version: 1, positions: {
      'recording:synthetic-timeline': { seconds: 60, playing: true },
    } }))
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Gesture required', 'NotAllowedError'))
  })
  await mockReview(page, 'workspace')
  await expect.poll(() => page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(60)
  await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeEnabled()
  await expect(page.getByText('Audio could not be loaded.', { exact: true })).toHaveCount(0)
})
