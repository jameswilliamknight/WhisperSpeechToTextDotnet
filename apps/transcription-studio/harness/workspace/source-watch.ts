import { watch, type FSWatcher } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { noSymlinks } from './locations'

export type SourceWatchEvent = { type: 'change' } | { type: 'error'; message: string }

interface SourceWatchOptions {
  directory: () => Promise<string>
  notify: (event: SourceWatchEvent) => void
  reconcileMs?: number
  debounceMs?: number
}

/** fs.watch is the fast path; inode/settings reconciliation repairs missed folder replacement
 * events and retries unavailable folders. Each SSE subscriber owns and disposes its resources.
 * No directory contents or transcript data are polled.
 */
export function watchSourceDirectory(options: SourceWatchOptions): () => void {
  let watcher: FSWatcher | undefined
  let identity: string | undefined
  let stopped = false
  let checking = false
  let failure = ''
  let debounce: ReturnType<typeof setTimeout> | undefined

  function changed() {
    if (stopped || debounce) return
    debounce = setTimeout(() => {
      debounce = undefined
      if (!stopped) options.notify({ type: 'change' })
    }, options.debounceMs ?? 150)
  }

  function detach() {
    watcher?.close()
    watcher = undefined
    identity = undefined
    if (debounce) clearTimeout(debounce)
    debounce = undefined
  }

  function failed() {
    detach()
    const message = 'Source folder is unavailable. Automatic updates will retry.'
    if (!stopped && failure !== message) options.notify({ type: 'error', message })
    failure = message
  }

  async function reconcile() {
    if (checking || stopped) return
    checking = true
    try {
      const directory = await options.directory()
      if (stopped) return
      if (!directory) {
        if (identity !== '' || failure) {
          detach()
          identity = ''
          failure = ''
          options.notify({ type: 'change' })
        }
        return
      }
      await noSymlinks(directory)
      const stat = await lstat(directory)
      if (stopped) return
      if (!stat.isDirectory()) throw new Error('Source is not a directory')
      const nextIdentity = `${directory}:${stat.dev}:${stat.ino}`
      if (identity === nextIdentity && watcher) return
      detach()
      watcher = watch(directory, { persistent: false }, changed)
      watcher.on('error', failed)
      identity = nextIdentity
      failure = ''
      // Subscribe before the initial refresh, so mutations during listing are not lost.
      options.notify({ type: 'change' })
    }
    catch { if (!stopped) failed() }
    finally { checking = false }
  }

  const interval = setInterval(() => { void reconcile() }, options.reconcileMs ?? 2000)
  interval.unref?.()
  void reconcile()
  return () => {
    stopped = true
    clearInterval(interval)
    detach()
  }
}
