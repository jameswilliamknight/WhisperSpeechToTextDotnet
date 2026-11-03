import { expect, test } from '@playwright/test'
import { mockReview } from './timelineFixture'

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: playback backdrop fades independently of its slow pulse`, async ({ page }) => {
    const unexpected = await mockReview(page, surface)
    const background = page.getByTestId('timeline-playing-background')
    const pulse = background.locator('div')
    await expect(background).toHaveCSS('opacity', '0')
    await expect(background).toHaveCSS('transition-duration', '0.7s')
    await expect(pulse).toHaveCSS('animation-duration', '4s')
    await expect(pulse).toHaveCSS('animation-name', 'pulse')
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
