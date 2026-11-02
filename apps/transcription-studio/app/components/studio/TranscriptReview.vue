<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import type { DeepReadonly } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import type { BenchmarkRun } from '../../../shared/studio'
import { speakerIds as getSpeakerIds, speakerLabels } from '#shared/speakerNames'
import { speakerColor } from '#shared/speakerColors'
import { timestamp } from '../../utils/studioFormat'
import { transcriptPassages } from '../../utils/transcriptPassages'
import RenameSpeakerModal from '../speakers/RenameSpeakerModal.vue'
import SpeakerName from '../speakers/SpeakerName.vue'
import SpeakerTimeline from './SpeakerTimeline.vue'
import { useTimelineAudio } from '../../composables/useTimelineAudio'

const props = defineProps<{ run: DeepReadonly<BenchmarkRun> | null; audioAvailable: boolean }>()
const emit = defineEmits<{ renameSpeaker: [{ speakerId: string; name: string }] }>()
const audio = useTemplateRef<HTMLAudioElement>('audio')
const audioSource = computed(() => props.audioAvailable ? '/api/audio' : undefined)
const { currentTime, duration, playing, audioError, audioAvailable: playbackAvailable, seek, togglePlayback } = useTimelineAudio({
  audio, source: () => audioSource.value, identity: () => props.run?.id,
})
const renameSpeakerId = shallowRef<string | null>(null)
const passages = computed(() => transcriptPassages(props.run?.result?.segments ?? []))
const speakers = computed(() => props.run?.result ? getSpeakerIds(props.run.result) : [])
const labels = computed(() => speakerLabels(speakers.value, props.run?.speakerNames))
const renameCurrentName = computed(() => renameSpeakerId.value ? labels.value.get(renameSpeakerId.value) ?? '' : '')
const renameDefaultName = computed(() => {
  const index = renameSpeakerId.value ? speakers.value.indexOf(renameSpeakerId.value) : -1
  return index >= 0 ? `Speaker ${index + 1}` : ''
})
watch(() => props.run?.id, () => { renameSpeakerId.value = null })
function speakerName(speaker?: string) {
  return speaker ? labels.value.get(speaker) ?? speaker : 'Unlabelled'
}
function editSpeaker(speakerId?: string) { if (speakerId) renameSpeakerId.value = speakerId }
function saveSpeakerName(name: string) {
  const speakerId = renameSpeakerId.value
  if (!speakerId) return
  emit('renameSpeaker', { speakerId, name })
  renameSpeakerId.value = null
}
</script>

<template>
  <section aria-labelledby="review-heading" class="min-w-0 overflow-hidden rounded-md border border-fb-border">
    <header v-if="!run?.result" class="border-b border-fb-border px-5 py-3">
      <h2 id="review-heading" class="text-base font-medium">Transcript &amp; speakers</h2>
    </header>
    <div v-if="!run" class="px-5 py-12 text-center text-sm text-fb-muted">No run selected</div>
    <div v-else-if="!run.result" class="px-5 py-10 text-center">
      <p class="text-sm text-fb-foreground-muted">{{ run.status === 'running' ? 'Processing locally…' : 'No transcript available' }}</p>
    </div>
    <template v-else>
      <audio v-if="audioSource" ref="audio" hidden preload="metadata" :src="audioSource" />
      <SpeakerTimeline :turns="run.result.turns" :segments="run.result.segments" :duration="duration || run.durationSeconds" :speaker-names="run.speakerNames" :current-time="currentTime" :playing="playing" :audio-available="playbackAvailable" @toggle-playback="togglePlayback" @seek="seek" @rename-speaker="editSpeaker">
        <template #heading><h2 id="review-heading" class="text-base font-medium">Transcript &amp; speakers</h2></template>
        <template #actions><span class="text-xs text-fb-muted">{{ passages.length }} passages</span></template>
        <template #feedback>
          <p v-if="!audioSource" class="mb-2 text-xs text-fb-muted">Audio playback is unavailable until the source is prepared.</p>
          <p v-if="audioError" role="status" class="mb-2 text-xs text-fb-warning">Audio could not be loaded. Transcript review remains available.</p>
        </template>
      </SpeakerTimeline>
      <ol v-if="passages.length" class="max-h-[34rem] divide-y divide-fb-border overflow-y-auto" aria-label="Transcript segments">
        <li v-for="(segment, index) in passages" :key="index" :style="speakerColor(segment.speaker, speakers)" class="grid gap-3 px-5 py-5 sm:grid-cols-[9rem_1fr]">
          <div><UiButton variant="naked" size="sm" class="cursor-default px-0 font-mono text-xs" :disabled="!playbackAvailable" :aria-label="`Seek to ${timestamp(segment.start)}`" @click="seek(segment.start)">{{ timestamp(segment.start) }} – {{ timestamp(segment.end) }}</UiButton><SpeakerName v-if="segment.speaker" class="mt-1 text-xs" :name="speakerName(segment.speaker)" @edit="editSpeaker(segment.speaker)" /><p v-else class="mt-1 text-xs text-fb-muted">Unlabelled</p></div>
          <p class="whitespace-pre-wrap break-words text-sm leading-7">{{ segment.text }}</p>
        </li>
      </ol>
      <p v-else class="p-8 text-center text-sm text-fb-muted">The backend returned no transcript segments.</p>
    </template>
    <RenameSpeakerModal
      :open="renameSpeakerId !== null"
      :current-name="renameCurrentName"
      :default-name="renameDefaultName"
      @close="renameSpeakerId = null"
      @save="saveSpeakerName"
    />
  </section>
</template>
