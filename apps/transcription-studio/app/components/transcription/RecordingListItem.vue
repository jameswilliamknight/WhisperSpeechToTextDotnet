<script setup lang="ts">
import { computed } from 'vue'
import { formatDistanceStrict, isValid } from 'date-fns'
import { AudioLines, RotateCcw, Square } from 'lucide-vue-next'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'
import UiTooltip from '#layers/freebore-ui/app/components/ui/UiTooltip.vue'
import type { RecordingRow } from '#shared/recordingRows'
import { bytesLabel } from '~/utils/studioFormat'
import RecordingStatus from './RecordingStatus.vue'

const props = defineProps<{ row: RecordingRow; selected: boolean; disabled: boolean; engineAvailable: boolean; now: number }>()
const emit = defineEmits<{ select: [id: string]; start: []; cancel: [] }>()
const job = computed(() => props.row.latest)
const date = computed(() => new Date(job.value?.startedAt ?? props.row.source?.modifiedAt ?? ''))
const relativeTime = computed(() => {
  if (!isValid(date.value)) return 'Unknown time'
  const elapsed = props.now - date.value.getTime()
  return elapsed >= 0 && elapsed < 60_000 ? 'Just now' : formatDistanceStrict(date.value, props.now, { addSuffix: true, roundingMethod: 'floor' })
})
const exactTime = computed(() => isValid(date.value) ? date.value.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' }) : '')
const available = computed(() => job.value ? job.value.retryAvailable !== false : !!props.row.source)
const action = computed(() => `${job.value ? 'Retranscribe' : 'Transcribe'} ${props.row.name}`)
const explanation = computed(() => !available.value ? job.value?.retryUnavailableReason ?? 'The recording is unavailable.' : !props.engineAvailable ? 'The local Whisper engine is unavailable.' : props.disabled ? 'Wait for the current operation to finish.' : action.value)
const selectId = computed(() => props.row.transcript?.id)
</script>

<template>
  <li :data-recording-id="row.id" class="flex min-w-0 items-center pr-3">
    <button type="button" :data-job-id="job?.id" :aria-pressed="selected" :disabled="disabled || !selectId" :title="selectId ? selected ? 'Currently displayed transcript' : 'Open transcript' : undefined" class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:bg-fb-surface-muted focus-visible:outline-none disabled:cursor-default" :class="{ 'hover:bg-fb-surface-muted': selectId && !selected && !disabled }" @click="selectId && emit('select', selectId)">
      <RecordingStatus :status="job?.status" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium" :title="row.name">{{ row.name }}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fb-muted">
          <time :datetime="job?.startedAt ?? row.source?.modifiedAt" :title="exactTime">{{ relativeTime }}</time>
          <span v-if="row.source">{{ bytesLabel(row.source.bytes) }}</span>
          <span v-if="selected && row.transcript && !disabled" class="text-fb-muted">Viewing transcript</span>
          <span v-if="job?.status === 'running'" class="text-fb-muted">Transcribing</span>
          <span v-if="job && !row.source">Not in current folder</span>
        </span>
        <span v-if="job?.error" :title="job.error" class="mt-1 block truncate text-xs text-fb-danger">{{ job.error }}</span>
        <span v-if="job && job.status !== 'succeeded' && job.status !== 'running' && row.transcript" class="mt-1 block text-xs text-fb-muted">Previous successful transcript available</span>
      </span>
    </button>
    <UiTooltip v-if="job?.status === 'running'" title="Cancel transcription" strategy="fixed"><UiIconButton :icon="Square" variant="tertiary" size="sm" :aria-label="`Cancel transcription of ${row.name}`" @click="emit('cancel')" /></UiTooltip>
    <UiTooltip v-else :title="action" :description="explanation === action ? undefined : explanation" strategy="fixed">
      <UiIconButton :icon="job ? RotateCcw : AudioLines" variant="tertiary" size="sm" class="focus-visible:bg-fb-surface-muted focus-visible:ring-0" :aria-label="action" :disabled="disabled || !engineAvailable || !available" @click="emit('start')" />
    </UiTooltip>
  </li>
</template>
