import { createEventStream, defineEventHandler } from 'h3'
import { settings } from '../../../harness/workspace/store'
import { watchSourceDirectory } from '../../../harness/workspace/source-watch'

export default defineEventHandler((event) => {
  const stream = createEventStream(event)
  let closed = false
  function push(type: string, data: unknown) {
    if (!closed) void stream.push({ event: type, data: JSON.stringify(data) }).catch(() => { void stream.close() })
  }
  const stop = watchSourceDirectory({
    directory: async () => (await settings()).sourceDirectory,
    notify: notification => push(notification.type === 'change' ? 'source-change' : 'watch-error', notification),
  })
  const heartbeat = setInterval(() => push('heartbeat', {}), 15_000)
  heartbeat.unref?.()
  stream.onClosed(() => {
    closed = true
    stop()
    clearInterval(heartbeat)
  })
  return stream.send()
})
