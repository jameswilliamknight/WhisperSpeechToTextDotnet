<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import type { TranscriptionJob } from '../../../shared/workspace'
import { timestamp } from '../../utils/studioFormat'

const props = defineProps<{ job: TranscriptionJob | null; uploading: boolean }>()
defineEmits<{ cancel: [] }>()

const now = shallowRef(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(timer))

const percent = computed(() => props.job?.progress?.percent ?? null)
const stage = computed(() => props.uploading
  ? 'Uploading a private working copy'
  : props.job?.progress?.stage ?? props.job?.phase ?? 'Starting locally')
const elapsed = computed(() => {
  if (!props.job?.startedAt) return undefined
  const start = Date.parse(props.job.startedAt)
  if (!Number.isFinite(start)) return undefined
  return Math.max(0, (now.value - start) / 1000)
})
const audioDuration = computed(() => props.job?.durationSeconds ? `${timestamp(props.job.durationSeconds)} audio` : undefined)
const progressText = computed(() => percent.value === null ? stage.value : `${stage.value} · ${percent.value}%`)
</script>

<template>
  <section v-if="job || uploading" aria-label="Transcription progress" class="space-y-3 rounded-md border border-fb-primary-border bg-fb-primary-soft/20 px-5 py-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium">{{ uploading ? 'Uploading audio…' : job?.name }}</p>
        <p class="mt-1 text-xs text-fb-muted"><span v-if="elapsed !== undefined">{{ timestamp(elapsed) }} elapsed</span><span v-if="elapsed !== undefined && audioDuration"> · </span><span v-if="audioDuration">{{ audioDuration }}</span></p>
      </div>
      <UiButton size="sm" @click="$emit('cancel')">{{ uploading ? 'Cancel upload' : 'Cancel transcription' }}</UiButton>
    </div>
    <div role="progressbar" aria-label="Transcription progress" :aria-valuemin="percent === null ? undefined : 0" :aria-valuemax="percent === null ? undefined : 100" :aria-valuenow="percent ?? undefined" :aria-valuetext="progressText" class="h-1.5 overflow-hidden rounded-full bg-fb-border">
      <div class="h-full rounded-full bg-fb-primary" :class="percent === null ? 'w-1/3 animate-pulse' : 'transition-[width] duration-500'" :style="percent === null ? undefined : { width: `${percent}%` }" />
    </div>
    <p role="status" aria-live="polite" class="text-sm text-fb-muted">{{ progressText }}</p>
  </section>
</template>
