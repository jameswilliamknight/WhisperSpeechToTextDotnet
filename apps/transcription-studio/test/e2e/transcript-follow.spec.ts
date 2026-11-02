import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import type { WorkerResult } from '../../shared/studio'
import { mockReview, result } from './timelineFixture'

const segments = Array.from({ length: 40 }, (_, index) => ({
  start: index * 4, end: (index + 1) * 4,
  text: `Synthetic passage ${index + 1}. A distinct alternating speaker keeps this passage separate.`,
  speaker: index % 2 ? 'b' : 'a',
}))
const longTranscript: WorkerResult = {
  ...result, segments,
  turns: segments.map(({ start, end, speaker }) => ({ start, end, speaker })),
}

async function geometry(list: Locator) {
  return list.evaluate(view => {
    const active = view.querySelector('[aria-current="true"]')!
    const row = active.getBoundingClientRect()
    const box = view.getBoundingClientRect()
    const target = Math.max(0, Math.min(view.scrollHeight - view.clientHeight,
      view.scrollTop + row.top - box.top - (view.clientHeight - row.height) / 2))
    return { scroll: view.scrollTop, error: Math.abs(view.scrollTop - target), visible: row.top >= box.top && row.bottom <= box.bottom }
  })
}

test('workspace: seeking while paused reveals the active passage via timeline, slider and timestamp', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const unexpected = await mockReview(page, 'workspace', longTranscript)
  const list = page.getByRole('list', { name: 'Transcript passages' })
  const audio = page.locator('audio')
  await expect(list.locator('li')).toHaveCount(40)
  await expect(page.getByText('No transcript passages were returned.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Seek to Speaker 1, 2:00 to 2:04', exact: true }).click()
  await expect(list.locator('[data-passage-index="30"]')).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => geometry(list).then(value => value.error)).toBeLessThan(2)
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(120)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)

  const position = page.getByRole('slider', { name: 'Audio position' })
  await position.focus()
  await position.press('End')
  await expect(list.locator('[data-passage-index="39"]')).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => geometry(list).then(value => value.visible)).toBe(true)
  await list.getByRole('button', { name: 'Seek to 1:20', exact: true }).click()
  await expect(list.locator('[data-passage-index="20"]')).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => geometry(list).then(value => value.error)).toBeLessThan(2)
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(80)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
  await expect(page.getByRole('button', { name: 'Resume following', exact: true })).toBeHidden()
  const jump = list.getByRole('button', { name: 'Jump to 1:20 in recording', exact: true })
  await jump.focus()
  await expect(jump).toHaveCSS('opacity', '1')
  await jump.click()
  await page.getByRole('button', { name: 'Play audio', exact: true }).hover()
  await expect(jump).not.toBeFocused()
  await expect(jump).toHaveCSS('opacity', '0')
  await jump.focus()
  await jump.press('Enter')
  await expect(jump).toBeFocused()
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(80)
  await expect(page.getByRole('slider', { name: 'Audio position' })).toHaveValue('80')
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
  await expect(page.getByText('No transcript passages were returned.', { exact: true })).toHaveCount(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})

test('workspace: wheel browsing leaves playback alone until Resume following recentres it', async ({ page }) => {
  const unexpected = await mockReview(page, 'workspace', longTranscript)
  const list = page.getByRole('list', { name: 'Transcript passages' })
  const audio = page.locator('audio')
  const mediaTime = () => audio.evaluate(element => (element as HTMLAudioElement).currentTime)
  await page.getByRole('button', { name: 'Seek to Speaker 1, 2:00 to 2:04', exact: true }).click()
  await expect.poll(() => geometry(list).then(value => value.error)).toBeLessThan(2)
  await page.getByRole('button', { name: 'Play audio', exact: true }).click()
  await expect.poll(mediaTime).toBeGreaterThan(120)
  const before = await mediaTime()
  await list.hover()
  await page.mouse.wheel(0, -10000)
  const resume = page.getByRole('button', { name: 'Resume following', exact: true })
  await expect(resume).toBeVisible()
  await expect.poll(() => geometry(list).then(value => value.scroll)).toBe(0)
  // Cross a passage boundary: following must stay suspended even as aria-current
  // updates from the real audio clock. Wheel input must neither seek nor pause.
  await expect.poll(async () => {
    expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false)
    expect((await geometry(list)).scroll).toBe(0)
    const now = await mediaTime()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThan(before + 10)
    return now
  }, { timeout: 8000, intervals: [100] }).toBeGreaterThan(before + 4.2)
  await expect(list.locator('[data-passage-index="31"]')).toHaveAttribute('aria-current', 'true')
  await resume.click()
  await expect(resume).toBeHidden()
  await expect.poll(() => geometry(list).then(value => value.error)).toBeLessThan(2)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false)
  expect(await mediaTime()).toBeGreaterThan(before + 4)
  expect(unexpected).toEqual([])
})

test('workspace: keyboard and scrollbar browsing pause follow; an explicit seek restores it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const unexpected = await mockReview(page, 'workspace', longTranscript)
  const list = page.getByRole('list', { name: 'Transcript passages' })
  const audio = page.locator('audio')
  const resume = page.getByRole('button', { name: 'Resume following', exact: true })
  await list.focus()
  await list.press('End')
  await expect(resume).toBeVisible()
  await expect.poll(() => geometry(list).then(value => value.scroll)).toBeGreaterThan(0)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(0)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)

  await page.getByRole('button', { name: 'Seek to Speaker 1, 1:20 to 1:24', exact: true }).click()
  await expect(resume).toBeHidden()
  await expect.poll(() => geometry(list).then(value => value.error)).toBeLessThan(2)
  const bounds = await list.boundingBox()
  // Hit the scrollbar edge, not passage content or a timestamp button.
  await page.mouse.click(bounds!.x + bounds!.width - 2, bounds!.y + 20)
  await expect(resume).toBeVisible()
  expect(await audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(80)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
  await list.getByRole('button', { name: 'Seek to 0:40', exact: true }).click()
  await expect(resume).toBeHidden()
  await expect(list.locator('[data-passage-index="10"]')).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => geometry(list).then(value => value.error)).toBeLessThan(2)
  expect(await audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(40)
  expect(unexpected).toEqual([])
})
