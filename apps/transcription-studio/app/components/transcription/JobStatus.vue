<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import type { TranscriptionJob } from '#shared/workspace'
import { timestamp } from '~/utils/studioFormat'

const props = defineProps<{ job: TranscriptionJob | null; uploading: boolean }>()
defineEmits<{ cancel: []; acknowledge: [] }>()

const now = shallowRef(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(timer))

const completed = computed(() => props.job?.status === 'succeeded')
const percent = computed(() => completed.value ? 100 : props.job?.progress?.percent ?? null)
const stage = computed(() => {
  if (completed.value) return 'Transcription complete'
  if (props.uploading) return 'Uploading'
  const value = props.job?.progress?.stage ?? props.job?.phase ?? 'Preparing'
  if (value === 'Transcribing audio') return 'Transcribing'
  if (value === 'Complete' || value === 'Saving transcript') return 'Finishing'
  return value
})
const elapsed = computed(() => {
  if (!props.job?.startedAt) return undefined
  const start = Date.parse(props.job.startedAt)
  if (!Number.isFinite(start)) return undefined
  if (completed.value) return props.job?.wallSeconds ?? Math.max(0, (Date.parse(props.job?.finishedAt ?? props.job!.startedAt) - start) / 1000)
  return Math.max(0, (now.value - start) / 1000)
})
const progressText = computed(() => percent.value === null ? stage.value : `${stage.value} ${percent.value}%`)
</script>

<template>
  <section aria-label="Transcription progress" class="flex min-h-[10rem] flex-col justify-center gap-4 px-5 py-4">
    <div class="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-6">
      <div class="min-w-0"><p role="status" aria-live="polite" class="text-sm font-medium">{{ stage }}</p><p :title="job?.name" class="mt-1 truncate text-xs text-fb-muted">{{ job?.name ?? (uploading ? 'Making a private working copy…' : 'Preparing a new transcription…') }}</p></div>
      <div class="flex justify-end">
        <UiButton v-if="completed" size="sm" @click="$emit('acknowledge')">View transcript</UiButton>
        <UiButton v-else-if="job || uploading" size="sm" @click="$emit('cancel')">{{ uploading ? 'Cancel upload' : 'Cancel transcription' }}</UiButton>
        <span v-else class="text-xs text-fb-muted">Starting…</span>
      </div>
    </div>
    <div class="grid grid-cols-[minmax(0,1fr)_5ch] items-center gap-4">
      <div role="progressbar" aria-label="Transcription progress" :aria-valuemin="percent === null ? undefined : 0" :aria-valuemax="percent === null ? undefined : 100" :aria-valuenow="percent ?? undefined" :aria-valuetext="progressText" class="h-1.5 overflow-hidden rounded-full bg-fb-border">
        <div class="h-full rounded-full bg-fb-primary" :class="percent === null ? 'w-1/3 motion-safe:animate-pulse' : 'transition-[width] duration-500 motion-reduce:transition-none'" :style="percent === null ? undefined : { width: `${percent}%` }" />
      </div>
      <span data-testid="progress-percentage" class="w-[5ch] text-right font-mono text-sm tabular-nums text-fb-muted">{{ percent === null ? '—' : `${percent}%` }}</span>
    </div>
    <div class="flex items-center justify-between gap-6 text-xs text-fb-muted">
      <span class="flex items-center gap-3"><span>Elapsed</span><span data-testid="progress-elapsed" class="inline-block w-[9ch] text-right font-mono tabular-nums">{{ elapsed === undefined ? '—' : timestamp(elapsed) }}</span></span>
      <span class="flex items-center gap-3"><span>Audio length</span><span data-testid="progress-audio-length" class="inline-block w-[9ch] text-right font-mono tabular-nums">{{ job?.durationSeconds ? timestamp(job.durationSeconds) : '—' }}</span></span>
    </div>
  </section>
</template>
