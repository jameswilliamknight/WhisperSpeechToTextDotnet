<script setup lang="ts">
import { computed } from 'vue'
import { Circle, CircleCheck, CircleX, LoaderCircle, CircleSlash, TriangleAlert } from 'lucide-vue-next'
import type { RunStatus } from '#shared/studio'

const props = defineProps<{ status?: RunStatus }>()
const states = {
  ready: { icon: Circle, label: 'Not transcribed', color: 'text-fb-muted' },
  succeeded: { icon: CircleCheck, label: 'Succeeded', color: 'text-green-400' },
  failed: { icon: CircleX, label: 'Failed', color: 'text-red-400' },
  running: { icon: LoaderCircle, label: 'Transcribing', color: 'text-fb-primary' },
  cancelled: { icon: CircleSlash, label: 'Cancelled', color: 'text-fb-muted' },
  interrupted: { icon: TriangleAlert, label: 'Interrupted', color: 'text-amber-400' },
} as const
const state = computed(() => states[props.status ?? 'ready'])
</script>

<template>
  <span role="img" :aria-label="state.label" :title="state.label" class="shrink-0" :class="state.color"><component :is="state.icon" class="size-4" :class="{ 'animate-spin motion-reduce:animate-none': status === 'running' }" aria-hidden="true" /></span>
</template>
