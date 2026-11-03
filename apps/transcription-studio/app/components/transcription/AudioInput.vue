<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import { Upload } from 'lucide-vue-next'

defineProps<{ disabled: boolean; selectedName?: string; embedded?: boolean }>()
const emit = defineEmits<{ select: [file: File | null] }>()
const error = shallowRef('')
const dragging = shallowRef(false)
const input = useTemplateRef<HTMLInputElement>('input')
let dragDepth = 0
const extensions = '.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aiff,.aif,.mp4,.wma,.webm'
function select(files: FileList | null) {
  error.value = ''
  if (!files?.length) return
  // An invalid replacement must not leave an older file armed for transcription.
  emit('select', null)
  const file = files[0]!
  if (files.length !== 1) { error.value = 'Choose one audio file at a time.'; return }
  if (!extensions.split(',').some(extension => file.name.toLowerCase().endsWith(extension))) {
    error.value = 'Unsupported audio file. Choose WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF, MP4, WMA or WebM.'
    return
  }
  emit('select', file)
}
function drop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  select(event.dataTransfer?.files ?? null)
}
function enter(event: DragEvent, disabled: boolean) {
  if (disabled || !event.dataTransfer?.types.includes('Files')) return
  dragDepth++
  dragging.value = true
}
function leave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  select(input.files)
  // The selected File is retained by the parent; clearing allows choosing that same file again.
  input.value = ''
}
</script>

<template>
  <section aria-labelledby="audio-heading" class="relative shrink-0 p-3" :class="embedded ? 'border-b border-fb-border' : 'rounded-md border-2 border-fb-border'" @dragenter.prevent="enter($event, disabled)" @dragover.prevent="($event.dataTransfer && ($event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'))" @dragleave.prevent="leave" @drop.prevent="!disabled && drop($event)">
    <div class="flex flex-wrap items-center gap-3" :class="{ 'invisible': dragging }">
      <h2 id="audio-heading" class="mr-auto text-sm font-medium">Audio file</h2>
      <input id="audio-file" ref="input" type="file" aria-label="Choose audio file" :accept="extensions" :disabled="disabled" class="sr-only" tabindex="-1" @change="choose">
      <UiButton size="sm" :disabled="disabled" @click="input?.click()">Choose file</UiButton>
      <slot name="actions" />
    </div>
    <p v-if="selectedName" :title="selectedName" class="mt-2 truncate text-xs text-fb-muted" :class="{ 'invisible': dragging }">Selected: {{ selectedName }}</p>
    <p v-if="error" role="alert" class="mt-2 text-xs text-fb-danger">{{ error }}</p>
    <div v-if="dragging" role="status" class="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 rounded-md border-2 border-dashed border-fb-primary bg-fb-surface text-sm text-fb-primary"><Upload class="size-5" />Drop audio to select</div>
  </section>
</template>
