<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { useTimelineViewStore } from '~/stores/timelineView'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { ChevronsLeftRight, ChevronsRightLeft, Pause, Play } from 'lucide-vue-next'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'
import type { SpeakerTurn, TranscriptSegment } from '#shared/studio'
import { turnHighlightText } from '~/utils/transcriptHighlight'
import TimelineTurnTooltip from './TimelineTurnTooltip.vue'
import { useActiveTurns } from '~/composables/useActiveTurns'
import { speakerLabels } from '#shared/speakerNames'
import { speakerColor } from '#shared/speakerColors'
import { timestamp } from '~/utils/studioFormat'
import SpeakerName from '~/components/speakers/SpeakerName.vue'
import { useTimelineFollow } from '~/composables/useTimelineFollow'
import { useTimelineOverflow } from '~/composables/useTimelineOverflow'
import { useTranscriptProcessing } from '~/composables/useTranscriptProcessing'

const props = defineProps<{
  identity: string
  turns: readonly Readonly<SpeakerTurn>[]
  segments?: readonly Readonly<TranscriptSegment>[]
  duration?: number
  speakerNames?: Readonly<Record<string, string>>
  currentTime?: number
  playing?: boolean
  audioAvailable?: boolean
}>()
const emit = defineEmits<{ seek: [seconds: number]; renameSpeaker: [speakerId: string]; togglePlayback: [] }>()
const timelineView = useTimelineViewStore()
const processing = useTranscriptProcessing()
const expanded = computed(() => timelineView.expanded)
onMounted(() => timelineView.select(props.identity))
watch(() => props.identity, identity => timelineView.select(identity))
const [animationParent] = useAutoAnimate<HTMLElement>({ duration: 300 })
const speakers = computed(() => [...new Set(props.turns.map(turn => turn.speaker))])
const labels = computed(() => speakerLabels(speakers.value, props.speakerNames))
const length = computed(() => Math.max(props.duration ?? 0, ...props.turns.map(turn => turn.end), 1))
const position = computed(() => Math.min(length.value, Math.max(0, props.currentTime ?? 0)))
const progress = computed(() => `${position.value / length.value * 100}%`)
const active = useActiveTurns(() => props.turns, () => props.currentTime ?? 0)
const canvas = useTemplateRef<HTMLElement>('canvas')
const labelGutter = useTemplateRef<HTMLElement>('labelGutter')
const { canScrollRight } = useTimelineOverflow(animationParent, canvas)
const { startDrag, finishDrag } = useTimelineFollow({ viewport: animationParent, canvas, leadingOverlay: labelGutter, expanded, position, duration: length })
// A fixed time scale makes clips comparable; short clips still fill the viewport.
// The keyed sibling below triggers AutoAnimate's layout pass: style mutations
// alone only refresh its measurements and do not animate the canvas's width.
// Reserve the original label gutter inside the single scroll canvas. Its real
// turns can pass behind the labels; zero time and the usable rail stay put.
const canvasStyle = computed(() => ({ width: expanded.value ? `max(calc(100% - 8rem), ${length.value * 12}px)` : 'calc(100% - 8rem)' }))
function seekAt(event: MouseEvent) {
  if (!props.audioAvailable) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('seek', Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * length.value)
}
// Group the display, not the underlying turns: overlap data and seek targets stay intact.
const lanes = computed(() => speakers.value.map((speaker, index) => ({
  speaker, speakerNumber: index + 1,
  turns: props.turns.map((turn, index) => ({ turn, index })).filter(({ turn }) => turn.speaker === speaker).map(({ turn, index: turnIndex }) => ({
    ...turn, index: turnIndex,
    content: turnHighlightText(turnIndex, props.segments ?? [], props.turns, processing.value),
    left: `${Math.max(0, turn.start) / length.value * 100}%`,
    width: `${Math.max(0.1, turn.end - turn.start) / length.value * 100}%`,
  })),
})))
</script>

<template>
  <section aria-labelledby="timeline-heading" class="scrollbar-area relative isolate min-w-0 border-b border-fb-border px-5 py-3">
    <!-- Keep the pulse running behind an independent fade. Pausing during a
         pulse must fade from its current colour rather than snap to a keyframe. -->
    <div aria-hidden="true" data-testid="timeline-playing-background" class="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700 ease-in-out motion-reduce:transition-none" :class="playing ? 'opacity-100' : 'opacity-0'">
      <div class="h-full w-full animate-pulse bg-neutral-950 [animation-duration:4s] motion-reduce:animate-none" />
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <slot name="heading" />
      <div class="flex items-center gap-3">
        <UiIconButton :icon="playing ? Pause : Play" variant="tertiary" :aria-label="playing ? 'Pause audio' : 'Play audio'" :disabled="!audioAvailable" @click="emit('togglePlayback')" />
        <h3 id="timeline-heading" :class="$slots.heading ? 'sr-only' : 'text-sm font-medium'">Speaker timeline</h3>
        <span aria-label="Playback time" class="font-mono text-xs tabular-nums text-fb-muted">{{ timestamp(position) }} / {{ timestamp(length) }}</span>
      </div>
      <div class="ml-auto flex min-w-0 flex-wrap items-center gap-3"><slot name="actions" />
      <UiIconButton :icon="expanded ? ChevronsRightLeft : ChevronsLeftRight" variant="tertiary" :aria-label="expanded ? 'Fit timeline to width' : 'Expand timeline to time scale'" :title="expanded ? 'Fit timeline to width' : 'Expand timeline (12 pixels per second)'" :aria-pressed="expanded" @click="timelineView.toggle()" />
      </div>
    </div>
    <slot name="feedback" />
    <p v-if="!turns.length" class="text-sm text-fb-muted">No speaker turns returned by this backend.</p>
    <div class="relative">
      <!-- This fixed sibling intercepts pointer input before it reaches faded
           turns. Only the original rail area can seek or open turn previews. -->
      <div ref="labelGutter" class="absolute inset-y-0 left-0 z-30 w-30 pt-4" aria-label="Timeline speakers">
        <div class="w-28 space-y-1.5">
        <div v-for="lane in lanes" :key="lane.speaker" :style="speakerColor(lane.speaker, speakers)" class="flex h-5 items-center">
          <SpeakerName :name="labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`" class="w-full text-xs" @edit="emit('renameSpeaker', lane.speaker)" />
        </div>
        </div>
      </div>
    <div ref="animationParent" class="hover-scrollbar -mx-2 min-w-0 scroll-pl-32 overflow-x-auto px-2 pb-1" :class="canScrollRight ? '[mask-image:linear-gradient(to_right,transparent_2.5rem,black_8rem,black_calc(100%_-_2rem),transparent)]' : '[mask-image:linear-gradient(to_right,transparent_2.5rem,black_8rem,black)]'" aria-label="Timeline viewport">
      <span :key="String(expanded)" aria-hidden="true" class="absolute size-0 overflow-hidden" />
      <div ref="canvas" class="relative ml-32" data-testid="timeline-canvas" :style="canvasStyle">
        <div class="relative h-4">
          <input type="range" min="0" :max="length" step="0.01" :value="position" :disabled="!audioAvailable" aria-label="Audio position" :aria-valuetext="`${timestamp(position)} of ${timestamp(length)}`" class="peer absolute inset-0 z-10 m-0 h-4 w-full cursor-pointer opacity-0" @pointerdown="startDrag" @lostpointercapture="finishDrag" @input="emit('seek', Number(($event.target as HTMLInputElement).value))">
          <span data-testid="timeline-position-marker" aria-hidden="true" class="pointer-events-none absolute top-0 z-20 size-4 -translate-x-1/2 rounded-full bg-fb-primary" :style="{ left: progress }" />
        </div>
        <div class="relative space-y-1.5">
          <div v-for="lane in lanes" :key="lane.speaker" role="group" :style="speakerColor(lane.speaker, speakers)" :aria-label="`${labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`} timeline`">
            <div class="relative h-5 overflow-hidden rounded bg-fb-surface-muted/50 [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%_-_8px),transparent)]" @click="seekAt">
              <TimelineTurnTooltip v-for="turn in lane.turns" :key="turn.index" class="absolute inset-y-0 min-w-px" :style="{ left: turn.left, width: turn.width }" :title="`${labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`} · ${timestamp(turn.start)}–${timestamp(turn.end)}`" :content="turn.content" :turn-index="turn.index" :turns="turns" :speakers="speakers" :active="active">
                <button type="button" class="h-full w-full cursor-pointer rounded border border-(--speaker-border) bg-(--speaker-fill) hover:bg-(--speaker-border) focus-visible:outline-2 focus-visible:outline-(--speaker-color)" :aria-label="`Seek to ${labels.get(lane.speaker) ?? `Speaker ${lane.speakerNumber}`}, ${timestamp(turn.start)} to ${timestamp(turn.end)}`" @click.stop="emit('seek', turn.start)" />
              </TimelineTurnTooltip>
            </div>
          </div>
          <div aria-hidden="true" class="pointer-events-none absolute inset-y-0 inset-x-0">
            <div class="absolute inset-y-0 left-0 bg-fb-primary/10" :style="{ width: progress }" />
            <div data-testid="timeline-playhead" class="absolute -top-2 bottom-0 w-0.5 bg-fb-primary" :style="{ left: progress, transform: 'translateX(-50%)' }" />
          </div>
        </div>
        <div class="mt-3 flex justify-between font-mono text-xs text-fb-muted"><span data-testid="timeline-start">Start · 0:00</span><span>{{ timestamp(length) }}</span></div>
      </div>
    </div>
    </div>
  </section>
</template>
