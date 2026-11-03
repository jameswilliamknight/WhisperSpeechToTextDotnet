import { computed, onMounted } from 'vue'
import { processingFromToggles } from '#shared/transcriptProcessing'
import { useWorkspaceStore } from '~/stores/workspace'

/** Both review surfaces share the SQLite-backed workspace preferences. */
export function useTranscriptProcessing() {
  const workspace = useWorkspaceStore()
  onMounted(() => { void workspace.hydrate() })
  return computed(() => processingFromToggles(workspace.preferences.transcriptProcessing))
}
