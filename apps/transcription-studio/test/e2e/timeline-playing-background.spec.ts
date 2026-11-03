import { expect, test } from '@playwright/test'
import { mockReview } from './timelineFixture'

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: playback backdrop fades independently of its slow pulse`, async ({ page }) => {
    const unexpected = await mockReview(page, surface)
    const background = page.getByTestId('timeline-playing-background')
    const pulse = background.locator('div')
    await expect(background).toHaveCSS('opacity', '0')
    await expect(background).toHaveCSS('transition-duration', '1s')
    await expect(pulse).toHaveCSS('animation-duration', '6s')
    await expect(pulse).toHaveCSS('animation-timing-function', 'ease-in-out')
    await expect(pulse).toHaveCSS('animation-name', 'pulse')
    // A charcoal overlay lifts the dark canvas without the pale white wash.
    // Rasterise to sRGB so this is independent of CSS colour serialisation.
    const fill = await pulse.evaluate(element => {
      const context = document.createElement('canvas').getContext('2d')!
      context.fillStyle = getComputedStyle(element).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    })
    expect(fill[0]).toBeGreaterThanOrEqual(60)
    expect(fill[0]).toBeLessThanOrEqual(68)
    expect(fill[1]).toBe(fill[0])
    expect(fill[2]).toBe(fill[0])
    expect(fill[3]).toBe(77)
    await expect(background).toHaveCSS('pointer-events', 'none')
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect(background).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    await expect(background).toHaveCSS('opacity', '0')
    // Rapid reversals retain one mounted pulse instead of restarting keyframes.
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    await expect(background).toHaveCSS('opacity', '0')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(background).toHaveCSS('transition-property', 'none')
    await expect(pulse).toHaveCSS('animation-name', 'none')
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect(background).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    expect(unexpected).toEqual([])
  })
}

test('performance opt-out persists and replaces the pulse on both screens', async ({ page }) => {
  const unexpected = await mockReview(page, 'workspace')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Playback', exact: true }).click()
  const toggle = page.getByRole('switch', { name: 'Disable playback pulse', exact: true })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await page.reload()
  await page.getByRole('tab', { name: 'Playback', exact: true }).click()
  await expect(toggle).toBeChecked()
  for (const screen of ['Transcribe', 'Benchmarks']) {
    await page.getByRole('link', { name: screen, exact: true }).click()
    const background = page.getByTestId('timeline-playing-background')
    const fill = background.locator('div')
    await expect(fill).toHaveCSS('animation-name', 'none')
    await expect(fill).not.toHaveClass(/animate-pulse/)
    await expect(fill).toHaveClass(/bg-neutral-900/)
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect(background).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
    await expect(background).toHaveCSS('opacity', '0')
  }
  expect(unexpected).toEqual([])
})
