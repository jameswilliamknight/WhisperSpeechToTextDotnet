<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'
import { RefreshCw } from 'lucide-vue-next'
import UiNotice from '#layers/freebore-ui/app/components/ui/UiNotice.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import AudioInput from './AudioInput.vue'
import SourceFiles from './SourceFiles.vue'
import JobHistory from './JobHistory.vue'
import JobStatus from './JobStatus.vue'
import TranscriptPanel from './TranscriptPanel.vue'
import WorkspaceLibraryTabs from './WorkspaceLibraryTabs.vue'
import { useSourceDirectoryWatch } from '../../composables/useSourceDirectoryWatch'

const workspace = useWorkspaceStore()
useSourceDirectoryWatch()
// Browser File objects belong to this input session, not serializable application state.
const file = shallowRef<File | null>(null)
const sourceName = shallowRef('')
const disabled = computed(() => workspace.busy || !!workspace.snapshot?.activeJobId)
const canStart = computed(() => !disabled.value && !!workspace.snapshot?.engine.available && !!(file.value || sourceName.value))
onMounted(() => { void workspace.hydrate() })
function selectFile(value: File | null) { file.value = value; sourceName.value = '' }
function selectSource(value: string) { sourceName.value = value; file.value = null }
async function start() {
  const source = file.value ?? sourceName.value
  if (source && await workspace.transcribe(source)) { file.value = null; sourceName.value = '' }
}
</script>

<template>
  <div class="flex h-full min-h-[52rem] flex-col gap-4">
    <h1 class="sr-only">Transcribe</h1>
    <UiNotice v-if="workspace.error" tone="danger" title="Workspace error">{{ workspace.error }} <UiButton v-if="!workspace.snapshot" size="sm" :disabled="workspace.loading" @click="workspace.hydrate()">Retry</UiButton></UiNotice>
    <p v-if="workspace.loading" role="status" class="p-8 text-sm text-fb-muted">Loading local workspace…</p>
    <template v-if="workspace.snapshot">
      <UiNotice v-if="!workspace.snapshot.engine.available" tone="warning" title="Whisper unavailable">{{ workspace.snapshot.engine.reason || 'The local Whisper engine is not configured.' }}</UiNotice>
      <JobStatus :job="workspace.activeJob" :uploading="workspace.uploading" @cancel="workspace.cancel()" />
      <TranscriptPanel :job="workspace.detail" :loading="workspace.detailLoading" :with-speakers="workspace.preferences.copyWithSpeakers" @copy-preference="workspace.savePreferences({ copyWithSpeakers: $event })" @rename-speaker="workspace.renameSpeaker">
        <template #sidebar>
        <div class="flex min-h-0 flex-1 flex-col">
          <WorkspaceLibraryTabs :initial-tab="workspace.snapshot.jobs.length ? 'recent' : 'library'">
            <template #actions><UiIconButton :icon="RefreshCw" variant="tertiary" size="xs" aria-label="Refresh" title="Refresh workspace" :disabled="workspace.loading" @click="workspace.refresh()" /></template>
            <template #recent><JobHistory embedded :jobs="workspace.snapshot.jobs" :selected-id="workspace.preferences.selectedJobId" @select="workspace.selectJob($event)" /></template>
            <template #library>
              <AudioInput embedded :disabled="disabled" :selected-name="file?.name || sourceName" @select="selectFile">
                <template #actions><UiButton size="sm" :disabled="!canStart" @click="start">{{ workspace.uploading ? 'Uploading…' : 'Transcribe' }}</UiButton></template>
              </AudioInput>
              <SourceFiles :files="workspace.sourceFiles" :configured="!!workspace.snapshot.settings.sourceDirectory" :loading="workspace.sourcesLoading" :disabled="disabled" :selected="sourceName" :error="workspace.sourceError" @select="selectSource" />
            </template>
          </WorkspaceLibraryTabs>
        </div>
        </template>
      </TranscriptPanel>
    </template>
  </div>
</template>
