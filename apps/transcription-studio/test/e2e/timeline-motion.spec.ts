import { expect, test } from '@playwright/test'
import { mockReview, result } from './timelineFixture'

// A long transcript must not make the per-frame clock rebuild thousands of
// controls. Only synthetic text is used for performance measurements.
const segments = Array.from({ length: 400 }, (_, index) => ({
  start: index * 0.45, end: (index + 1) * 0.45,
  speaker: index % 2 ? 'b' : 'a', text: Array(20).fill(`fixture${index}`).join(' '),
}))
const longResult = { ...result, segments, turns: segments.map(({ start, end, speaker }) => ({ start, end, speaker })) }

for (const surface of ['workspace', 'benchmarks'] as const) {
  test(`${surface}: following keeps the playhead steady between native scroll pixels`, async ({ page }) => {
    const unexpected = await mockReview(page, surface, longResult)
    await page.getByRole('button', { name: 'Expand timeline to time scale', exact: true }).click()
    await page.getByRole('slider', { name: 'Audio position', exact: true }).fill('90')
    // Finish expand/collapse before measuring steady-state follow motion.
    await page.getByTestId('timeline-canvas').evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished))
    })
    await page.getByRole('button', { name: 'Play audio', exact: true }).click()
    await expect.poll(() => page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(90.3)
    const profiler = await page.context().newCDPSession(page)
    await profiler.send('Performance.enable')
    const before = await profiler.send('Performance.getMetrics')
    const samples = await page.evaluate(() => new Promise<{ x: number; time: number }[]>(resolve => {
      const samples: { x: number; time: number }[] = []
      const playhead = document.querySelector('[data-testid="timeline-playhead"]')!
      const audio = document.querySelector('audio')!
      function tick() {
        samples.push({ x: playhead.getBoundingClientRect().x, time: audio.currentTime })
        if (samples.length < 90) requestAnimationFrame(tick)
        else resolve(samples)
      }
      requestAnimationFrame(tick)
    }))
    const after = await profiler.send('Performance.getMetrics')
    const metrics = Object.fromEntries(after.metrics.filter(metric => ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].includes(metric.name)).map(metric => [metric.name, metric.value - before.metrics.find(value => value.name === metric.name)!.value]))
    await test.info().attach('frame-work', { body: JSON.stringify(metrics), contentType: 'application/json' })
    console.info('[timeline-frame-work]', surface, metrics)
    const positions = samples.map(sample => sample.x)
    expect(samples.at(-1)!.time).toBeGreaterThan(samples[0]!.time + 0.3)
    // Native scrolling alone visibly sawtooths by a device pixel; allow only
    // layout precision noise after fractional compensation, not easing lag.
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.1)
    expect(unexpected).toEqual([])
  })
}
