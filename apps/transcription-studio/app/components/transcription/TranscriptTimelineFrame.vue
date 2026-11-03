<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{ available: boolean; loading: boolean; progress?: boolean }>()
const frame = useTemplateRef<HTMLElement>('frame')
const height = shallowRef(164)
const lanes = shallowRef(2)
let observer: ResizeObserver | undefined
// Deterministic decorative segments suggest speech cadence without retaining another job's data.
function placeholderSegments(lane: number) {
  return Array.from({ length: 72 }, (_, index) => ({
    left: `${index / 72 * 100}%`,
    width: `${(0.2 + ((index * 13 + lane * 7) % 11) / 14) / 72 * 100}%`,
    opacity: 0.3 + ((index * 7 + lane * 3) % 5) * 0.14,
    visible: (index * 17 + lane * 11) % 23 < 17,
  })).filter(segment => segment.visible)
}
const placeholderLanes = computed(() => Array.from({ length: lanes.value }, (_, lane) => placeholderSegments(lane)))
// Keep only geometry across jobs, never stale speaker names, turns, or playback controls.
function measure() {
  if (!props.available || !frame.value) return
  height.value = frame.value.getBoundingClientRect().height
  lanes.value = frame.value.querySelectorAll('[role="group"]').length || 2
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (frame.value) observer.observe(frame.value)
  measure()
})
watch(() => props.available, measure, { flush: 'post' })
onScopeDispose(() => observer?.disconnect())
</script>

<template>
  <div ref="frame" data-testid="transcript-timeline-frame" class="relative col-span-2 col-start-1 row-start-1 grid overflow-hidden rounded-md border-2 border-fb-border" :style="{ minHeight: `${height}px` }">
    <h2 v-if="!progress" class="pointer-events-none absolute top-3 left-5 z-10 flex h-8 items-center font-medium">Timeline</h2>
    <div v-if="progress" class="col-start-1 row-start-1 min-w-0 self-stretch"><slot name="progress" /></div>
    <Transition v-else enter-active-class="transition-opacity duration-300 motion-reduce:transition-none" leave-active-class="transition-opacity duration-200 motion-reduce:transition-none" enter-from-class="opacity-0" leave-to-class="opacity-0">
      <div v-if="available" key="timeline" class="col-start-1 row-start-1 min-w-0 self-start"><slot /></div>
      <section v-else key="placeholder" aria-label="Timeline unavailable" :aria-busy="loading" class="col-start-1 row-start-1 px-5 py-3">
        <div class="mb-3 flex h-8 items-center gap-4">
          <span aria-hidden="true" class="invisible font-medium">Timeline</span>
          <div aria-hidden="true" class="size-6 rounded-full bg-fb-surface-muted" />
          <span class="text-xs text-fb-muted">{{ loading ? 'Loading timeline…' : 'No timeline available' }}</span>
          <div aria-hidden="true" class="ml-auto h-6 w-24 rounded bg-fb-surface-muted" />
        </div>
        <div aria-hidden="true" class="space-y-1.5 pt-4" :class="{ 'motion-safe:animate-pulse': loading }">
          <div v-for="(segments, lane) in placeholderLanes" :key="lane" class="grid grid-cols-[7rem_1fr] items-center gap-4">
            <div class="h-3 w-20 rounded bg-fb-surface-muted" />
            <div class="relative h-5 overflow-hidden rounded bg-fb-surface-muted/40">
              <div v-for="(segment, index) in segments" :key="index" class="absolute inset-y-0 min-w-px rounded-sm bg-fb-surface-muted" :style="{ left: segment.left, width: segment.width, opacity: segment.opacity }" />
            </div>
          </div>
        </div>
        <div aria-hidden="true" class="mt-3 ml-32 flex justify-between"><div class="h-3 w-8 rounded bg-fb-surface-muted" /><div class="h-3 w-8 rounded bg-fb-surface-muted" /></div>
      </section>
    </Transition>
  </div>
</template>
