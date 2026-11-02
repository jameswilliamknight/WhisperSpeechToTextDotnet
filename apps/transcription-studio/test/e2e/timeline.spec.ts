import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { duration, mockReview } from './timelineFixture'

// Inspect rendered geometry rather than the composable's private state. The
// playhead may leave the centre only where the browser clamps scrolling.
async function followGeometry(page: Page) {
  return page.getByLabel('Timeline viewport').evaluate(view => {
    const playhead = view.querySelector('[data-testid="timeline-playhead"]')!
    const head = playhead.getBoundingClientRect()
    const x = head.left + head.width / 2 - view.getBoundingClientRect().left
    const maximum = view.scrollWidth - view.clientWidth
    const expected = Math.max(0, Math.min(maximum, view.scrollLeft + x - view.clientWidth / 2))
    return { scroll: view.scrollLeft, maximum, x, centre: view.clientWidth / 2, error: Math.abs(view.scrollLeft - expected) }
  })
}

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: timeline controls play, pause and seek the real media clock`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const unexpected = await mockReview(page, surface)
    const audio = page.locator('audio')
    const position = page.getByRole('slider', { name: 'Audio position' })
    const clock = page.getByLabel('Playback time')
    const playhead = page.getByTestId('timeline-playhead')
    const mediaTime = () => audio.evaluate(element => (element as HTMLAudioElement).currentTime)

    await expect(audio).toBeHidden()
    expect(await audio.evaluate(element => (element as HTMLAudioElement).controls)).toBe(false)
    await expect(clock).toHaveText('0:00 / 3:00')
    await expect(position).toHaveValue('0')
    await expect(playhead).toHaveCSS('left', '0px')
    const marker = page.getByTestId('timeline-position-marker')
    const markerFits = () => marker.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const viewport = element.closest('[aria-label="Timeline viewport"]')!.getBoundingClientRect()
      return bounds.left >= viewport.left && bounds.right <= viewport.right
    })
    expect(await markerFits()).toBe(true)
    await position.press('End')
    await expect.poll(markerFits).toBe(true)
    await position.press('Home')
    await expect(position).toHaveValue('0')
    const initialX = await playhead.evaluate(element => element.getBoundingClientRect().x)
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.getByRole('button', { name: 'Seek to Speaker 1, 0:00 to 0:08', exact: true }).hover()
    await expect(page.locator('.v-popper__popper').getByText('Synthetic opening.', { exact: true })).toBeVisible()
    const tooltip = page.locator('.v-popper__popper--shown')
    await expect.poll(() => tooltip.evaluate(element => element.getBoundingClientRect().bottom <= innerHeight)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight)

    if (surface === 'workspace') {
      const expand = page.getByRole('button', { name: 'Expand timeline to time scale', exact: true })
      await expand.click()
      const fit = page.getByRole('button', { name: 'Fit timeline to width', exact: true })
      await expect(fit).toBeFocused()
      await page.keyboard.press('Space')
      await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible()
      await expect(fit).not.toBeFocused()
      await expect(fit).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.down('Space')
      await page.keyboard.down('Space')
      await page.keyboard.up('Space')
      await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeVisible()
      await expect(fit).toHaveAttribute('aria-pressed', 'true')
      await fit.click()
      await position.focus()
      await page.keyboard.press('Space')
      await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible()
      await expect(position).not.toBeFocused()
      await page.keyboard.press('Space')
      await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeVisible()
      await position.focus()
      await page.keyboard.press('Home')
    }

    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible()
    await expect.poll(mediaTime).toBeGreaterThan(1)
    await expect.poll(() => position.inputValue().then(Number)).toBeGreaterThan(1)
    await expect(clock).not.toHaveText('0:00 / 3:00')
    await expect.poll(() => playhead.evaluate(element => element.getBoundingClientRect().x)).toBeGreaterThan(initialX + 2)
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeVisible()
    expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true)
    const pausedAt = await mediaTime()
    // A polling window also catches an incorrectly running clock after Pause.
    const pausedSince = Date.now()
    await expect.poll(async () => {
      expect(await mediaTime()).toBeCloseTo(pausedAt, 1)
      return Date.now() - pausedSince
    }, { intervals: [100], timeout: 1500 }).toBeGreaterThanOrEqual(350)

    // Native keyboard input on the custom range, rather than setting media state.
    await position.focus()
    await position.press('Home')
    await position.press('ArrowRight')
    await expect.poll(mediaTime).toBeCloseTo(0.01, 2)
    await position.press('End')
    await position.press('ArrowLeft')
    await expect.poll(mediaTime).toBeCloseTo(duration - 0.01, 2)

    await page.getByRole('button', { name: 'Seek to 1:00', exact: true }).click()
    await expect.poll(mediaTime).toBeCloseTo(60, 2)
    await expect(position).toHaveValue('60')
    await expect(clock).toHaveText('1:00 / 3:00')
    await expect.poll(() => playhead.evaluate(element => Number.parseFloat((element as HTMLElement).style.left))).toBeCloseTo(100 / 3, 2)
    await page.getByRole('button', { name: 'Seek to Speaker 1, 0:00 to 0:08', exact: true }).click()
    await expect.poll(mediaTime).toBe(0)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })

  test(`${surface}: expanded timeline centres the current position, follows playback and clamps at both ends`, async ({ page }) => {
    const unexpected = await mockReview(page, surface)
    const position = page.getByRole('slider', { name: 'Audio position' })
    const mediaTime = () => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)
    await page.getByRole('button', { name: 'Seek to 1:00', exact: true }).click()
    await page.getByRole('button', { name: 'Expand timeline to time scale' }).click()
    await expect.poll(() => page.getByTestId('timeline-canvas').evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(duration * 12, 0)
    await expect.poll(() => followGeometry(page).then(g => g.scroll)).toBeGreaterThan(0)
    await expect.poll(() => followGeometry(page).then(g => Math.abs(g.x - g.centre))).toBeLessThan(2)
    const initialScroll = (await followGeometry(page)).scroll

    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect.poll(mediaTime).toBeGreaterThan(61)
    await expect.poll(() => followGeometry(page).then(g => g.scroll)).toBeGreaterThan(initialScroll + 8)
    await expect.poll(() => followGeometry(page).then(g => Math.abs(g.x - g.centre))).toBeLessThan(2)
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()

    await position.focus()
    await position.press('End')
    await expect.poll(mediaTime).toBe(duration)
    await expect.poll(() => followGeometry(page).then(g => Math.abs(g.scroll - g.maximum))).toBeLessThan(2)
    expect((await followGeometry(page)).x).toBeGreaterThan((await followGeometry(page)).centre)
    await position.press('Home')
    await expect.poll(mediaTime).toBe(0)
    await expect.poll(() => followGeometry(page).then(g => g.scroll)).toBe(0)
    expect((await followGeometry(page)).x).toBeLessThan((await followGeometry(page)).centre)

    await page.getByRole('button', { name: 'Seek to 1:00', exact: true }).click()
    await expect.poll(() => followGeometry(page).then(g => g.scroll)).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Fit timeline to width' }).click()
    await expect.poll(() => followGeometry(page).then(g => g.scroll)).toBe(0)
    expect(unexpected).toEqual([])
  })

  test(`${surface}: range dragging suspends follow until pointer release, then recentres`, async ({ page }) => {
    const unexpected = await mockReview(page, surface)
    await page.getByRole('button', { name: 'Seek to 1:00', exact: true }).click()
    await page.getByRole('button', { name: 'Expand timeline to time scale' }).click()
    // A transient centred frame during AutoAnimate's width transition is not
    // enough: pointer coordinates must come from the settled expanded rail.
    await expect.poll(() => page.getByTestId('timeline-canvas').evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(duration * 12, 0)
    await expect.poll(() => followGeometry(page).then(g => Math.abs(g.x - g.centre))).toBeLessThan(2)
    const position = page.getByRole('slider', { name: 'Audio position' })
    const bounds = await position.boundingBox()
    expect(bounds).not.toBeNull()
    const geometry = await followGeometry(page)
    const viewport = await page.getByLabel('Timeline viewport').boundingBox()
    const x = viewport!.x + geometry.x
    const y = bounds!.y + bounds!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    try {
      await page.mouse.move(x + 140, y, { steps: 8 })
      await expect.poll(() => position.inputValue().then(Number)).toBeGreaterThan(68)
      const heldSince = Date.now()
      await expect.poll(async () => {
        const held = await followGeometry(page)
        expect(Math.abs(held.scroll - geometry.scroll)).toBeLessThan(2)
        expect(held.error).toBeGreaterThan(100)
        return Date.now() - heldSince
      }, { intervals: [100], timeout: 1500 }).toBeGreaterThanOrEqual(350)
    } finally {
      await page.mouse.up()
    }
    const panSamples = await page.getByLabel('Timeline viewport').evaluate(element => new Promise<number[]>((resolve) => {
      const values: number[] = []
      const started = performance.now()
      const sample = (now: number) => {
        values.push(element.scrollLeft)
        if (now - started < 350) requestAnimationFrame(sample)
        else resolve(values)
      }
      requestAnimationFrame(sample)
    }))
    // Release pans over intermediate frames rather than snapping in one step.
    expect(new Set(panSamples.map(value => Math.round(value))).size).toBeGreaterThan(3)
    await expect.poll(() => followGeometry(page).then(g => Math.abs(g.x - g.centre))).toBeLessThan(2)
    expect((await followGeometry(page)).scroll).toBeGreaterThan(geometry.scroll + 100)
    expect(unexpected).toEqual([])
  })

  test(`${surface}: expanded timeline uses 12px per second and scrolls internally, then fits again`, async ({ page }) => {
    const unexpected = await mockReview(page, surface)
    const canvas = page.getByTestId('timeline-canvas')
    const viewport = page.getByLabel('Timeline viewport')
    const scrollbar = await viewport.evaluate(element => ({
      height: getComputedStyle(element, '::-webkit-scrollbar').height,
      radius: getComputedStyle(element, '::-webkit-scrollbar-thumb').borderRadius,
      color: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
    }))
    expect(scrollbar.height).toBe('6px')
    expect(scrollbar.radius).toBe('999px')
    expect(scrollbar.color).not.toBe('rgba(0, 0, 0, 0)')
    const width = () => canvas.evaluate(element => element.getBoundingClientRect().width)
    const fittedWidth = await width()
    const documentFits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    await expect.poll(documentFits).toBe(true)

    await page.getByRole('button', { name: 'Expand timeline to time scale' }).click()
    const fit = page.getByRole('button', { name: 'Fit timeline to width' })
    await expect(fit).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(width).toBeCloseTo(duration * 12, 0)
    const lane = page.getByRole('group', { name: 'Speaker 1 timeline', exact: true })
    const turn = lane.getByRole('button', { name: 'Seek to Speaker 1, 0:00 to 0:08', exact: true })
    await expect.poll(() => turn.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(8 * 12, 0)
    await expect.poll(() => viewport.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    await expect.poll(documentFits).toBe(true)
    // A horizontal wheel gesture proves the oversized canvas can be reached,
    // rather than merely being clipped by an ancestor.
    await viewport.hover()
    await page.mouse.wheel(800, 0)
    await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    const labelGutter = page.getByLabel('Timeline speakers', { exact: true })
    const bounds = await labelGutter.boundingBox()
    const viewportBounds = await viewport.boundingBox()
    expect(bounds!.x + bounds!.width).toBeLessThan(viewportBounds!.x)

    await fit.click()
    await expect(page.getByRole('button', { name: 'Expand timeline to time scale' })).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(width).toBeCloseTo(fittedWidth, 0)
    await expect.poll(() => viewport.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await expect.poll(documentFits).toBe(true)
    expect(unexpected).toEqual([])
  })
}
