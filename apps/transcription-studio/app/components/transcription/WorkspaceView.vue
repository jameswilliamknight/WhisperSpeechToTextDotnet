<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'
import { RefreshCw } from 'lucide-vue-next'
import UiNotice from '#layers/freebore-ui/app/components/ui/UiNotice.vue'
import ConfirmModal from '#layers/freebore-ui/app/components/ui/ConfirmModal.vue'
import { recordingRows, type RecordingRow } from '#shared/recordingRows'
import { useWorkspaceStore } from '~/stores/workspace'
import { useTimelineViewStore } from '~/stores/timelineView'
import AudioInput from './AudioInput.vue'
import RecordingList from './RecordingList.vue'
import JobStatus from './JobStatus.vue'
import TranscriptPanel from './TranscriptPanel.vue'
import { useSourceDirectoryWatch } from '~/composables/useSourceDirectoryWatch'

const workspace = useWorkspaceStore()
const timelineView = useTimelineViewStore()
useSourceDirectoryWatch()
// Browser File objects belong to this input session, not serializable application state.
const file = shallowRef<File | null>(null)
const disabled = computed(() => workspace.busy || !!workspace.snapshot?.activeJobId || !!workspace.reviewPendingId)
const showProgress = computed(() => workspace.busy || workspace.uploading || !!workspace.progressJob)
const canStart = computed(() => !disabled.value && !!workspace.snapshot?.engine.available && !!file.value)
const rows = computed(() => recordingRows(workspace.sourceFiles, workspace.snapshot?.jobs ?? []))
const retryJob = computed(() => workspace.snapshot?.jobs.find(job => job.id === workspace.retryRequestedId))
onMounted(() => { void workspace.hydrate() })
function selectFile(value: File | null) { file.value = value; timelineView.reset() }
async function start() {
  if (file.value && await workspace.transcribe(file.value)) file.value = null
}
async function startRecording(row: RecordingRow) {
  if (disabled.value) return
  if (row.latest) workspace.requestRetry(row.latest.id)
  else if (row.source) await workspace.transcribe(row.source.name)
}
async function confirmRetry() {
  const job = retryJob.value
  if (!job || disabled.value || job.retryAvailable === false) return
  workspace.requestRetry(null)
  if (await workspace.retry(job.id)) file.value = null
}
</script>

<template>
  <div class="flex h-full min-h-[52rem] flex-col gap-4">
    <h1 class="sr-only">Transcribe</h1>
    <UiNotice v-if="workspace.error" tone="danger" title="Workspace error">{{ workspace.error }} <UiButton v-if="!workspace.snapshot" size="sm" :disabled="workspace.loading" @click="workspace.hydrate()">Retry</UiButton></UiNotice>
    <p v-if="workspace.loading" role="status" class="p-8 text-sm text-fb-muted">Loading local workspace…</p>
    <template v-if="workspace.snapshot">
      <UiNotice v-if="!workspace.snapshot.engine.available" tone="warning" title="Whisper unavailable">{{ workspace.snapshot.engine.reason || 'The local Whisper engine is not configured.' }}</UiNotice>
      <TranscriptPanel :job="showProgress ? null : workspace.detail" :loading="!showProgress && workspace.detailLoading" :progress-visible="showProgress" :progress-message="workspace.reviewPendingId ? 'Transcription complete. Choose View transcript above to review it.' : 'Transcribing… The previous result is kept safely but hidden while processing.'" :with-speakers="workspace.preferences.copyWithSpeakers" @rename-speaker="workspace.renameSpeaker">
        <template #progress><JobStatus :job="workspace.progressJob" :uploading="workspace.uploading" @cancel="workspace.cancel()" @acknowledge="workspace.acknowledgeCompletion()" /></template>
        <template #sidebar>
        <div class="flex min-h-0 flex-1 flex-col">
          <RecordingList :rows="rows" :selected-id="workspace.preferences.selectedJobId" :disabled="disabled" :engine-available="workspace.snapshot.engine.available" :configured="!!workspace.snapshot.settings.sourceDirectory" :loading="workspace.sourcesLoading" :error="workspace.sourceError" @select="workspace.selectJob($event)" @start="startRecording" @cancel="workspace.cancel()">
            <template #actions><UiIconButton :icon="RefreshCw" variant="tertiary" size="xs" aria-label="Refresh" title="Refresh workspace" :disabled="workspace.loading" @click="workspace.refresh()" /></template>
            <template #input>
              <AudioInput embedded :disabled="disabled" :selected-name="file?.name" @select="selectFile">
                <template #actions><UiButton size="sm" :disabled="!canStart" @click="start">{{ workspace.uploading ? 'Uploading…' : 'Transcribe' }}</UiButton></template>
              </AudioInput>
            </template>
          </RecordingList>
        </div>
        </template>
      </TranscriptPanel>
      <ConfirmModal :open="!!retryJob" title="Retranscribe recording?" :description="`Start a fresh transcription of ${retryJob?.name ?? 'this recording'}? Previous successful results and exports will be kept. The new transcript may have different speaker labels.`" confirm-label="Retranscribe" tone="primary" :confirm-disabled="disabled || !workspace.snapshot.engine.available || retryJob?.retryAvailable === false" @cancel="workspace.requestRetry(null)" @confirm="confirmRetry" />
    </template>
  </div>
</template>
