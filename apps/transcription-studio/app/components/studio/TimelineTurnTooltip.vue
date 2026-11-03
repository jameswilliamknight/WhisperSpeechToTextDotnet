<script setup lang="ts">
import { shallowRef } from 'vue'
import UiTooltip from '#layers/freebore-ui/app/components/ui/UiTooltip.vue'
import type { SpeakerTurn } from '#shared/studio'
import type { HighlightText } from '~/utils/transcriptHighlight'
import HighlightedTranscriptText from '~/components/transcription/HighlightedTranscriptText.vue'

defineProps<{
  title: string
  content: HighlightText
  turnIndex: number
  turns: readonly Readonly<SpeakerTurn>[]
  speakers: readonly string[]
  active: readonly number[]
}>()
const visible = shallowRef(false)
</script>

<template>
  <!-- Read-only previews must not block nearby playback controls while focused. -->
  <UiTooltip :title="title" :show-delay="250" popper-class="pointer-events-none!" @show="visible = true" @hide="visible = false">
    <slot />
    <template #popper>
      <div v-if="visible" class="max-w-[24rem] px-1 py-1" data-testid="turn-tooltip">
        <p class="mb-0.5 text-xs font-semibold text-fb-foreground">{{ title }}</p>
        <p class="whitespace-normal break-words text-xs leading-snug">
          <HighlightedTranscriptText v-if="content.text" :content="content" :turns="turns" :speakers="speakers" :active="active" :preview="turnIndex" />
          <span v-else class="text-fb-muted">No transcript text available for this segment.</span>
        </p>
      </div>
    </template>
  </UiTooltip>
</template>
