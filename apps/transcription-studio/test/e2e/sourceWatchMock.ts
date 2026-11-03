import type { Page } from '@playwright/test'

/** Keep synthetic reviews isolated from the owner's filesystem event stream. */
export async function mockSourceWatch(page: Page) {
  await page.addInitScript(() => {
    class SyntheticEventSource extends EventTarget {
      onerror: (() => void) | null = null
      onopen: (() => void) | null = null
      private disconnect = () => this.onerror?.()
      private reconnect = () => this.onopen?.()
      private notify = () => this.dispatchEvent(new MessageEvent('source-change', { data: '{"type":"change"}' }))
      constructor() {
        super()
        window.addEventListener('synthetic-recordings-change', this.notify)
        window.addEventListener('synthetic-watch-disconnect', this.disconnect)
        window.addEventListener('synthetic-watch-reconnect', this.reconnect)
        queueMicrotask(this.notify)
      }

      close() {
        window.removeEventListener('synthetic-recordings-change', this.notify)
        window.removeEventListener('synthetic-watch-disconnect', this.disconnect)
        window.removeEventListener('synthetic-watch-reconnect', this.reconnect)
      }
    }
    Object.defineProperty(window, 'EventSource', { value: SyntheticEventSource })
  })
}
