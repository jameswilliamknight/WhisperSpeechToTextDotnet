<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { ChevronsLeftRight, ChevronsRightLeft, Pause, Play } from 'lucide-vue-next'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'
import UiTooltip from '#layers/freebore-ui/app/components/ui/UiTooltip.vue'
import type { SpeakerTurn, TranscriptSegment } from '../../../shared/studio'
import { timelineTurnText } from '../../utils/timelineTurnText'
import { speakerLabels } from '#shared/speakerNames'
import { speakerColor } from '#shared/speakerColors'
import { timestamp } from '../../utils/studioFormat'
import SpeakerName from '../speakers/SpeakerName.vue'
import { useTimelineFollow } from '../../composables/useTimelineFollow'

const props = defineProps<{
  turns: readonly Readonly<SpeakerTurn>[]
  segments?: readonly Readonly<TranscriptSegment>[]
  duration?: number
  speakerNames?: Readonly<Record<string, string>>
  currentTime?: number
  playing?: boolean
  audioAvailable?: boolean
}>()
const emit = defineEmits<{ seek: [seconds: number]; renameSpeaker: [speakerId: string]; togglePlayback: [] }>()
const expanded = shallowRef(false)
const [animationParent] = useAutoAnimate<HTMLElement>({ duration: 300 })
const speakers = computed(() => [...new Set(props.turns.map(turn => turn.speaker))])
const labels = computed(() => speakerLabels(speakers.value, props.speakerNames))
const length = computed(() => Math.max(props.duration ?? 0, ...props.turns.map(turn => turn.end), 1))
const position = computed(() => Math.min(length.value, Math.max(0, props.currentTime ?? 0)))
const progress = computed(() => `${position.value / length.value * 100}%`)
const canvas = useTemplateRef<HTMLElement>('canvas')
const { startDrag, finishDrag } = useTimelineFollow({ viewport: animationParent, canvas, expanded, position, duration: length })
// A fixed time scale makes clips comparable; short clips still fill the viewport.
// The keyed sibling below triggers AutoAnimate's layout pass: style mutations
// alone only refresh its measurements and do not animate the canvas's width.
const canvasStyle = computed(() => ({ width: expanded.value ? `max(100%, ${length.value * 12}px)` : '100%' }))
function seekAt(event: MouseEvent) {
  if (!props.audioAvailable) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('seek', Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * length.value)
}
// Group the display, not the underlying turns: overlap data and seek targets stay intact.
const lanes = computed(() => speakers.value.map((speaker, index) => ({
  speaker, speakerNumber: index + 1,
  turns: props.turns.filter(turn => turn.speaker === speaker).map((turn, turnIndex) => ({
    ...turn, index: turnIndex,
    text: timelineTurnText(turn, props.segments ?? []),
    left: `${Math.max(0, turn.start) / length.value * 100}%`,
    width: `${Math.max(0.1, turn.end - turn.start) / length.value * 100}%`,
  })),
})))
</script>

<template>
  <section aria-labelledby="timeline-heading" class="min-w-0 border-b border-fb-border px-5 py-3">
    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <slot name="heading" />
      <div class="flex items-center gap-3">
        <UiIconButton :icon="playing ? Pause : Play" variant="tertiary" :aria-label="playing ? 'Pause audio' : 'Play audio'" :disabled="!audioAvailable" @click="emit('togglePlayback')" />
        <h3 id="timeline-heading" :class="$slots.heading ? 'sr-only' : 'text-sm font-medium'">Speaker timeline</h3>
        <span aria-label="Playback time" class="font-mono text-xs tabular-nums text-fb-muted">{{ timestamp(position) }} / {{ timestamp(length) }}</span>
      </div>
      <div class="ml-auto flex min-w-0 flex-wrap items-center gap-3"><slot name="actions" />
      <UiIconButton :icon="expanded ? ChevronsRightLeft : ChevronsLeftRight" variant="tertiary" :aria-label="expanded ? 'Fit timeline to width' : 'Expand timeline to time scale'" :title="expanded ? 'Fit timeline to width' : 'Expand timeline (12 pixels per second)'" :aria-pressed="expanded" @click="expanded = !expanded" />
      </div>
    </div>
    <slot name="feedback" />
    <p v-if="!turns.length" class="text-sm text-fb-muted">No speaker turns returned by this backend.</p>
    <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
      <div class="space-y-1.5 pt-4" aria-label="Timeline speakers">
        <div v-for="lane in lanes" :key="lane.speaker" :style="speakerColor(lane.speaker, speakers)" class="flex h-5 items-center">
          <SpeakerName :name="labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`" class="w-full text-xs" @edit="emit('renameSpeaker', lane.speaker)" />
        </div>
      </div>
    <div ref="animationParent" class="min-w-0 overflow-x-auto pb-1" aria-label="Timeline viewport">
      <span :key="String(expanded)" aria-hidden="true" class="absolute size-0 overflow-hidden" />
      <div ref="canvas" class="relative" data-testid="timeline-canvas" :style="canvasStyle">
        <div class="relative h-4">
          <input type="range" min="0" :max="length" step="0.01" :value="position" :disabled="!audioAvailable" aria-label="Audio position" :aria-valuetext="`${timestamp(position)} of ${timestamp(length)}`" class="peer absolute inset-0 z-10 m-0 h-4 w-full cursor-pointer opacity-0" @pointerdown="startDrag" @lostpointercapture="finishDrag" @input="emit('seek', Number(($event.target as HTMLInputElement).value))">
          <span aria-hidden="true" class="pointer-events-none absolute top-0 size-4 -translate-x-1/2 rounded-full bg-fb-primary" :style="{ left: progress }" />
        </div>
        <div class="relative space-y-1.5">
          <div v-for="lane in lanes" :key="lane.speaker" role="group" :style="speakerColor(lane.speaker, speakers)" :aria-label="`${labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`} timeline`">
            <div class="relative h-5 overflow-hidden rounded bg-fb-surface-muted/50" @click="seekAt">
              <UiTooltip v-for="turn in lane.turns" :key="turn.index" class="absolute inset-y-0 min-w-px" :style="{ left: turn.left, width: turn.width }" :title="`${labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`} · ${timestamp(turn.start)}–${timestamp(turn.end)}`" :description="turn.text || 'No transcript text available for this segment.'" :show-delay="250">
                <button type="button" class="h-full w-full cursor-pointer rounded border border-(--speaker-border) bg-(--speaker-fill) hover:bg-(--speaker-border) focus-visible:outline-2 focus-visible:outline-(--speaker-color)" :aria-label="`Seek to ${labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`}, ${timestamp(turn.start)} to ${timestamp(turn.end)}`" @click.stop="emit('seek', turn.start)" />
              </UiTooltip>
            </div>
          </div>
          <div aria-hidden="true" class="pointer-events-none absolute inset-y-0 inset-x-0">
            <div class="absolute inset-y-0 left-0 bg-fb-primary/10" :style="{ width: progress }" />
            <div data-testid="timeline-playhead" class="absolute -top-2 bottom-0 w-0.5 bg-fb-primary" :style="{ left: progress, transform: 'translateX(-50%)' }" />
          </div>
        </div>
        <div class="mt-3 flex justify-between font-mono text-xs text-fb-muted"><span>0:00</span><span>{{ timestamp(length) }}</span></div>
      </div>
    </div>
    </div>
  </section>
</template>
