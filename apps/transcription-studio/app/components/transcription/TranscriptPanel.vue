<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiToggleSwitch from '#layers/freebore-ui/app/components/ui/UiToggleSwitch.vue'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'
import UiTooltip from '#layers/freebore-ui/app/components/ui/UiTooltip.vue'
import { Copy } from 'lucide-vue-next'
import type { TranscriptionDetail } from '../../../shared/workspace'
import { formatTranscript } from '#shared/transcriptText'
import { speakerIds as getSpeakerIds, speakerLabels } from '#shared/speakerNames'
import { speakerColor } from '#shared/speakerColors'
import { transcriptPassages } from '../../utils/transcriptPassages'
import { timestamp } from '../../utils/studioFormat'
import RenameSpeakerModal from '../speakers/RenameSpeakerModal.vue'
import SpeakerName from '../speakers/SpeakerName.vue'
import SpeakerTimeline from '../studio/SpeakerTimeline.vue'
import TranscriptTimelineFrame from './TranscriptTimelineFrame.vue'
import { useTimelineAudio } from '../../composables/useTimelineAudio'
import { usePlaybackShortcut } from '../../composables/usePlaybackShortcut'
import { useTranscriptFollow } from '../../composables/useTranscriptFollow'

const props = defineProps<{ job: TranscriptionDetail | null; loading: boolean; withSpeakers: boolean }>()
const emit = defineEmits<{
  copyPreference: [value: boolean]
  renameSpeaker: [{ speakerId: string; name: string }]
}>()
const copyStatus = shallowRef('')
const copyError = shallowRef('')
const copyTooltip = computed(() => `Copy full transcript ${props.withSpeakers ? 'with' : 'without'} speaker labels`)
const audio = useTemplateRef<HTMLAudioElement>('audio')
const audioSource = computed(() => props.job?.audioAvailable ? `/api/transcriptions/${encodeURIComponent(props.job.id)}/audio` : undefined)
const { currentTime, duration, playing, audioError, audioAvailable, seek, togglePlayback } = useTimelineAudio({
  audio, source: () => audioSource.value, identity: () => props.job?.id,
})
usePlaybackShortcut(() => !props.loading && !!props.job?.result && audioAvailable.value, togglePlayback)
const renameSpeakerId = shallowRef<string | null>(null)
const passages = computed(() => transcriptPassages(props.job?.result?.segments ?? []))
const passageList = useTemplateRef<HTMLOListElement>('passageList')
const transcriptFollow = useTranscriptFollow({
  viewport: passageList, passages: () => passages.value,
  position: () => currentTime.value, identity: () => props.job?.id,
})
function seekAndFollow(seconds: number) {
  seek(seconds)
  transcriptFollow.resume()
}
const speakers = computed(() => props.job?.result ? getSpeakerIds(props.job.result) : [])
const labels = computed(() => speakerLabels(speakers.value, props.job?.speakerNames))
const renameCurrentName = computed(() => renameSpeakerId.value ? labels.value.get(renameSpeakerId.value) ?? '' : '')
const renameDefaultName = computed(() => {
  const index = renameSpeakerId.value ? speakers.value.indexOf(renameSpeakerId.value) : -1
  return index >= 0 ? `Speaker ${index + 1}` : ''
})
watch(() => props.job?.id, () => {
  renameSpeakerId.value = null
  copyStatus.value = ''
  copyError.value = ''
})
function editSpeaker(speakerId?: string) { if (speakerId) renameSpeakerId.value = speakerId }
function saveSpeakerName(name: string) {
  const speakerId = renameSpeakerId.value
  if (!speakerId) return
  emit('renameSpeaker', { speakerId, name })
  renameSpeakerId.value = null
}
async function copy() {
  copyStatus.value = ''; copyError.value = ''
  if (!props.job?.result) return
  try {
    await navigator.clipboard.writeText(formatTranscript(props.job.result, props.withSpeakers, props.job.speakerNames))
    copyStatus.value = props.withSpeakers ? 'Speaker-labelled text copied.' : 'Plain text copied.'
  }
  catch { copyError.value = 'Could not copy to the clipboard. Check browser clipboard permissions.' }
}
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.5fr)] grid-rows-[auto_minmax(0,1fr)] items-stretch gap-5">
    <audio v-if="!loading && job?.result && audioSource" ref="audio" hidden preload="metadata" :src="audioSource" />
    <TranscriptTimelineFrame :available="!loading && !!job?.result" :loading="loading">
        <SpeakerTimeline v-if="job?.result" :turns="job.result.turns" :segments="job.result.segments" :duration="duration || job.durationSeconds" :speaker-names="job.speakerNames" :current-time="currentTime" :playing="playing" :audio-available="audioAvailable" @toggle-playback="togglePlayback" @seek="seekAndFollow" @rename-speaker="editSpeaker">
          <template #heading><span aria-hidden="true" class="invisible font-medium">Timeline</span></template>
          <template #actions>
            <label class="flex items-center gap-2 whitespace-nowrap text-xs"><UiToggleSwitch :model-value="withSpeakers" aria-label="Copy with speaker labels" @update:model-value="$emit('copyPreference', $event)" />Speaker labels</label>
            <UiTooltip :title="copyTooltip"><UiIconButton :icon="Copy" variant="tertiary" aria-label="Copy text" @click="copy" /></UiTooltip>
          </template>
          <template #feedback>
            <p v-if="copyStatus" role="status" class="mb-2 text-xs text-fb-primary">{{ copyStatus }}</p>
            <p v-if="copyError" role="alert" class="mb-2 text-xs text-fb-danger">{{ copyError }}</p>
            <p v-if="audioError" role="status" class="mb-2 text-xs text-fb-warning">Audio could not be loaded.</p>
          </template>
        </SpeakerTimeline>
    </TranscriptTimelineFrame>
    <aside class="col-start-1 row-start-2 flex min-h-0 flex-col" aria-label="Audio files and history"><slot name="sidebar" /></aside>
    <section aria-labelledby="transcript-heading" class="relative col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-fb-border">
      <h2 id="transcript-heading" class="sr-only">Transcript</h2>
      <p v-if="loading" role="status" class="flex-1 p-8 text-sm text-fb-muted">Loading transcript…</p>
      <p v-else-if="!job" class="flex-1 p-8 text-sm text-fb-muted">Select a transcription from history.</p>
      <div v-else-if="!job.result" class="flex-1 space-y-2 p-8 text-sm text-fb-muted"><p>{{ job.status === 'running' ? 'Transcribing locally…' : 'No transcript available.' }}</p><p v-if="job.error" role="alert" class="text-fb-danger">{{ job.error }}</p><p v-if="job.status !== 'running'" class="capitalize">{{ job.status }}</p></div>
      <template v-else>
        <ol v-if="passages.length" ref="passageList" aria-label="Transcript passages" tabindex="0" class="min-h-[20rem] flex-1 divide-y divide-fb-border overflow-y-auto overscroll-contain" @wheel.passive="transcriptFollow.onWheel" @pointerdown="transcriptFollow.onPointerDown" @keydown="transcriptFollow.onKeydown">
          <li v-for="(passage, index) in passages" :key="index" :data-passage-index="index" :aria-current="index === transcriptFollow.activeIndex.value ? 'true' : undefined" :style="speakerColor(passage.speaker, speakers)" class="grid grid-cols-[8rem_1fr] gap-4 px-5 py-4 transition-colors motion-reduce:transition-none" :class="{ 'bg-fb-primary-soft/20': index === transcriptFollow.activeIndex.value }"><div><UiButton variant="naked" size="sm" class="px-0 font-mono text-xs" :disabled="!audioAvailable" :aria-label="`Seek to ${timestamp(passage.start)}`" @click="seekAndFollow(passage.start)">{{ timestamp(passage.start) }}</UiButton><SpeakerName v-if="passage.speaker" class="mt-1 text-xs" :name="labels.get(passage.speaker) ?? passage.speaker" @edit="editSpeaker(passage.speaker)" /><p v-else class="mt-1 text-xs text-fb-muted">Unlabelled</p></div><p class="whitespace-pre-wrap break-words text-sm leading-7">{{ passage.text }}</p></li>
        </ol>
        <UiButton v-if="passages.length && !transcriptFollow.following.value" size="sm" class="absolute right-4 bottom-4 shadow-lg" @click="transcriptFollow.resume">Resume following</UiButton>
        <p v-else class="flex-1 p-8 text-sm text-fb-muted">No transcript passages were returned.</p>
      </template>
    </section>
    <RenameSpeakerModal
      :open="renameSpeakerId !== null"
      :current-name="renameCurrentName"
      :default-name="renameDefaultName"
      @close="renameSpeakerId = null"
      @save="saveSpeakerName"
    />
  </div>
</template>
