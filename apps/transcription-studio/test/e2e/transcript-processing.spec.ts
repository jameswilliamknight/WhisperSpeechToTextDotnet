import { expect, test } from '@playwright/test'
import { mockReview, result } from './timelineFixture'
import { processingToggleDefaults } from '../../shared/transcriptProcessing'

const source = { text: 'Alpha tiny phrase small bridge onward.', start: 0, end: 3.92 }
const times = [[0, 0.5], [0.5, 0.7], [0.7, 2.06], [2.06, 2.93], [2.98, 3.42], [3.42, 3.92]]
let offset = 0
const words = source.text.split(' ').map((text, index) => {
  const word = { from: offset, to: offset + text.length, start: times[index]![0]!, end: times[index]![1]! }
  offset += text.length + 1
  return word
})
const review = { ...result, segments: [{ ...source, speaker: 'a', alignment: { version: 1 as const, source, words } }], turns: [
  { start: 0, end: 0.7, speaker: 'b' }, { start: 0.5, end: 1.829, speaker: 'a' }, { start: 3.701, end: 5, speaker: 'a' },
] }

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: all-false processing opt-outs persist and restore conservative condensing`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { sessionStorage.setItem('synthetic-copy', text) } } })
    })
    const unexpected = await mockReview(page, surface, review)
    const benchmarksLink = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Benchmarks', exact: true })
    await expect(benchmarksLink).toHaveAttribute('href', '/benchmarks')
    if (surface === 'benchmarks') await expect(benchmarksLink).toHaveAttribute('aria-current', 'page')
    const passages = page.locator(`ol[aria-label="${surface === 'workspace' ? 'Transcript passages' : 'Transcript segments'}"] li`)
    await expect(passages).toHaveCount(2)
    await expect(passages.last()).toContainText('tiny phrase small bridge onward.')
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Save settings', exact: true }).waitFor()
    const folders = page.getByRole('tab', { name: 'Folders', exact: true })
    await folders.focus()
    await folders.press('End')
    await expect(page.getByRole('tab', { name: 'Playback', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Transcript', exact: true })).toBeFocused()
    const switches = page.getByRole('tabpanel', { name: 'Transcript', exact: true }).getByRole('switch')
    await expect(switches).toHaveCount(5)
    for (const toggle of await switches.all()) await expect(toggle).toHaveAttribute('aria-checked', 'false')
    for (const toggle of await switches.all()) {
      const saved = page.waitForResponse(response => response.url().endsWith('/api/workspace/preferences') && response.request().method() === 'PUT')
      await toggle.click()
      expect((await saved).ok()).toBe(true)
    }
    await page.reload()
    await page.getByRole('button', { name: 'Save settings', exact: true }).waitFor()
    await page.getByRole('tab', { name: 'Transcript', exact: true }).click()
    for (const toggle of await switches.all()) await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await page.goto(surface === 'workspace' ? '/' : '/benchmarks')
    await expect(passages).toHaveCount(5)
    await expect(passages.filter({ hasText: 'Unlabelled' })).toHaveCount(2)
    if (surface === 'workspace') {
      await page.getByRole('button', { name: 'Copy text', exact: true }).click()
      expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toContain('Unlabelled: tiny\n')
    }
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Save settings', exact: true }).waitFor()
    await page.getByRole('tab', { name: 'Transcript', exact: true }).click()
    for (const toggle of await switches.all()) {
      const saved = page.waitForResponse(response => response.url().endsWith('/api/workspace/preferences') && response.request().method() === 'PUT')
      await toggle.click()
      await saved
    }
    await page.goto(surface === 'workspace' ? '/' : '/benchmarks')
    await expect(passages).toHaveCount(2)
    if (surface === 'workspace') {
      await page.getByRole('button', { name: 'Copy text', exact: true }).click()
      expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copy'))).toBe('Speaker 1: Alpha\nSpeaker 2: tiny phrase small bridge onward.\n')
    }
    expect(await page.evaluate(async () => (await fetch('/api/workspace').then(response => response.json())).preferences.transcriptProcessing)).toEqual(processingToggleDefaults)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}
