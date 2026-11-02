import { onMounted, onScopeDispose, watch } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'

/** Call once from WorkspaceView setup. EventSource reconnects automatically; every connection
 * starts with a source-change notification to repair any changes missed while disconnected.
 */
export function useSourceDirectoryWatch() {
  const store = useWorkspaceStore()
  let connection: EventSource | undefined
  let controller = new AbortController()
  let mounted = false

  function refresh() { void store.loadSources(controller.signal) }

  watch(() => store.snapshot?.settings.sourceDirectory, () => {
    if (mounted) refresh()
  })

  onMounted(() => {
    mounted = true
    refresh()
    connection = new EventSource('/api/source-files/watch')
    connection.addEventListener('source-change', refresh)
    connection.addEventListener('watch-error', () => {
      controller.abort()
      controller = new AbortController()
      store.sourceFiles = []
      store.sourceError = 'Recordings folder is unavailable. Automatic updates will retry.'
    })
    connection.onerror = () => {
      store.sourceError = 'Recordings updates disconnected. Reconnecting automatically…'
    }
  })

  onScopeDispose(() => {
    mounted = false
    controller.abort()
    connection?.close()
  })
}
