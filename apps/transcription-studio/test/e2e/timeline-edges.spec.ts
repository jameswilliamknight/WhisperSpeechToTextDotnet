import { expect, test } from '@playwright/test'
import { mockReview, result } from './timelineFixture'

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: real turns fade behind protected labels with one canvas and a stable Start origin`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const unexpected = await mockReview(page, surface, { ...result, turns: [
      { start: 0, end: 100, speaker: 'a' }, result.turns[1]!,
    ] })
    const canvas = page.getByTestId('timeline-canvas')
    const viewport = page.getByLabel('Timeline viewport', { exact: true })
    const labels = page.getByLabel('Timeline speakers', { exact: true })
    const rail = page.getByRole('slider', { name: 'Audio position', exact: true })
    const start = page.getByTestId('timeline-start')
    const mask = () => viewport.evaluate(element => getComputedStyle(element).maskImage)
    const rightFade = 'calc(100% - 32px)'
    await expect(canvas).toHaveCount(1)
    await expect(canvas.locator('button')).toHaveCount(2)
    await expect(page.locator('[data-backdrop-turn]')).toHaveCount(0)
    expect(await mask()).toContain('40px')
    expect(await mask()).not.toContain(rightFade)
    const origin = (await rail.boundingBox())!.x
    expect(origin).toBeCloseTo((await labels.boundingBox())!.x + 128, 0)
    expect((await start.boundingBox())!.x).toBeCloseTo(origin, 0)
    await page.getByRole('button', { name: 'Expand timeline to time scale', exact: true }).click()
    await expect.poll(() => canvas.evaluate(element => element.getBoundingClientRect().width)).toBe(2160)
    await expect.poll(mask).toContain(rightFade)
    await page.getByRole('button', { name: 'Seek to Speaker 2, 1:00 to 1:08', exact: true }).click()
    await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    // The one real segment intersects the faded label zone; there is no copy.
    const original = page.getByRole('button', { name: 'Seek to Speaker 1, 0:00 to 1:40', exact: true })
    const box = (await labels.boundingBox())!, turn = (await original.boundingBox())!
    expect(turn.x).toBeLessThan(box.x + box.width)
    expect(turn.x + turn.width).toBeGreaterThan(box.x)
    await page.mouse.click(box.x + box.width - 4, turn.y + turn.height / 2)
    expect(await page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(60)
    await expect(page.getByTestId('turn-tooltip')).toHaveCount(0)
    const view = (await viewport.boundingBox())!
    await page.mouse.move(box.x + box.width + 24, turn.y + turn.height / 2)
    expect(await original.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await expect(canvas.locator('button')).toHaveCount(2)
    // Wheel scrolling moves this same canvas, not a JS-synchronised duplicate.
    await page.mouse.move(view.x + view.width / 2, turn.y + turn.height / 2)
    const before = await viewport.evaluate(element => element.scrollLeft)
    await page.mouse.wheel(150, 0)
    await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(before)
    await rail.focus()
    await rail.press('End')
    await expect(rail).toHaveValue('180')
    await expect.poll(mask).not.toContain(rightFade)
    await rail.press('Home')
    await expect(rail).toHaveValue('0')
    await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBe(0)
    await expect.poll(mask).toContain(rightFade)
    expect((await start.boundingBox())!.x).toBeCloseTo(origin, 0)
    expect((await rail.boundingBox())!.x).toBeCloseTo(origin, 0)
    await expect(start).toHaveText('Start · 0:00')
    await page.getByRole('button', { name: 'Fit timeline to width', exact: true }).click()
    await expect.poll(mask).not.toContain(rightFade)
    expect((await start.boundingBox())!.x).toBeCloseTo(origin, 0)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}
