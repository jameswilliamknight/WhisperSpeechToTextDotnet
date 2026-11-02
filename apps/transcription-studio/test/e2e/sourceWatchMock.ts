import type { Page } from '@playwright/test'

/** Keep synthetic reviews isolated from the owner's filesystem event stream. */
export async function mockSourceWatch(page: Page) {
  await page.addInitScript(() => {
    class SyntheticEventSource extends EventTarget {
      private notify = () => this.dispatchEvent(new MessageEvent('source-change', { data: '{"type":"change"}' }))
      constructor() {
        super()
        window.addEventListener('synthetic-recordings-change', this.notify)
        queueMicrotask(this.notify)
      }

      close() { window.removeEventListener('synthetic-recordings-change', this.notify) }
    }
    Object.defineProperty(window, 'EventSource', { value: SyntheticEventSource })
  })
}
