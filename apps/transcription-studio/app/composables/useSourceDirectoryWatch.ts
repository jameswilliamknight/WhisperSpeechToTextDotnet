import { onMounted, onScopeDispose, watch } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { useScreenActivity } from './useScreenActivity'

/** Call once from WorkspaceView setup. EventSource reconnects automatically; every connection
 * starts with a source-change notification to repair any changes missed while disconnected.
 */
export function useSourceDirectoryWatch() {
  const store = useWorkspaceStore()
  const active = useScreenActivity()
  let reconnecting = false
  let connection: EventSource | undefined
  let controller = new AbortController()
  let mounted = false

  function refresh() { void store.loadSources(controller.signal) }
  function connected() { reconnecting = false; store.sourceReconnecting = false }
  watch(active, visible => { store.sourceReconnecting = visible && reconnecting })

  watch(() => store.snapshot?.settings.sourceDirectory, () => {
    if (mounted) refresh()
  })

  onMounted(() => {
    mounted = true
    refresh()
    connection = new EventSource('/api/source-files/watch')
    connection.onopen = connected
    connection.addEventListener('source-change', () => { connected(); refresh() })
    connection.addEventListener('watch-error', () => {
      controller.abort()
      controller = new AbortController()
      store.sourceFiles = []
      store.sourceError = 'Recordings folder is unavailable. Automatic updates will retry.'
    })
    connection.onerror = () => {
      // A retrying SSE transport is not a folder/read error. Keep usable rows
      // and expose quiet global feedback without replacing actionable errors.
      reconnecting = true
      store.sourceReconnecting = active.value
    }
  })

  onScopeDispose(() => {
    mounted = false
    controller.abort()
    connection?.close()
    connected()
  })
}
