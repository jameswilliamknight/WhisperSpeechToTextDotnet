<script setup lang="ts">
import { computed } from 'vue'
import type { SpeakerTurn } from '#shared/studio'
import { speakerColor } from '#shared/speakerColors'
import { textPieces, type HighlightText } from '~/utils/transcriptHighlight'

const props = defineProps<{
  content: HighlightText
  turns: readonly Readonly<SpeakerTurn>[]
  speakers: readonly string[]
  active: readonly number[]
  preview?: number
}>()
const pieces = computed(() => textPieces(props.content, props.active, props.preview).map(piece => ({
  ...piece,
  style: piece.turn === undefined ? undefined : speakerColor(props.turns[piece.turn]?.speaker, props.speakers),
})))
</script>

<template>
  <span class="text-fb-foreground" data-testid="highlighted-transcript"><span v-for="(piece, index) in pieces" :key="index" :style="piece.style" :data-playback-highlight="piece.playback || undefined" :data-preview-highlight="piece.preview || undefined" :class="{ 'rounded-sm bg-(--speaker-fill) underline decoration-(--speaker-border) underline-offset-4': piece.playback }">{{ piece.text }}</span></span>
</template>
