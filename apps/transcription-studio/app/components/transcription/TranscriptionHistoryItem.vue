<script setup lang="ts">
import { computed } from 'vue'
import { formatDistanceStrict, isValid } from 'date-fns'
import { CircleCheck, CircleX, LoaderCircle, CircleSlash, TriangleAlert } from 'lucide-vue-next'
import type { TranscriptionJob } from '../../../shared/workspace'

const props = defineProps<{ job: TranscriptionJob; selected: boolean; now: number }>()
defineEmits<{ select: [] }>()
const states = {
  succeeded: { icon: CircleCheck, label: 'Succeeded', color: 'text-green-400' },
  failed: { icon: CircleX, label: 'Failed', color: 'text-red-400' },
  running: { icon: LoaderCircle, label: 'Transcribing', color: 'text-fb-primary' },
  cancelled: { icon: CircleSlash, label: 'Cancelled', color: 'text-fb-muted' },
  interrupted: { icon: TriangleAlert, label: 'Interrupted', color: 'text-amber-400' },
} as const
const state = computed(() => states[props.job.status])
const date = computed(() => new Date(props.job.startedAt))
const relativeTime = computed(() => {
  if (!isValid(date.value)) return 'Unknown time'
  const elapsed = props.now - date.value.getTime()
  return elapsed >= 0 && elapsed < 60_000 ? 'Just now' : formatDistanceStrict(date.value, props.now, { addSuffix: true, roundingMethod: 'floor' })
})
const exactTime = computed(() => isValid(date.value)
  ? date.value.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })
  : props.job.startedAt)
</script>

<template>
  <button type="button" :data-job-id="job.id" :aria-pressed="selected" class="group flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left hover:bg-fb-surface-muted focus-visible:outline-2 focus-visible:outline-fb-primary" :class="selected ? 'border-fb-primary bg-fb-primary-soft/20' : 'border-transparent'" @click="$emit('select')">
    <span role="img" :aria-label="state.label" :title="state.label" class="shrink-0" :class="state.color"><component :is="state.icon" class="size-4" :class="{ 'animate-spin motion-reduce:animate-none': job.status === 'running' }" aria-hidden="true" /></span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium" :title="job.name">{{ job.name }}</span>
      <span class="mt-0.5 flex items-center gap-2 text-xs text-fb-muted">
        <time :datetime="job.startedAt" :title="exactTime">{{ relativeTime }}</time>
        <span v-if="job.status === 'running' && job.progress?.percent != null" class="text-fb-primary">{{ job.progress.percent }}%</span>
      </span>
    </span>
  </button>
</template>
