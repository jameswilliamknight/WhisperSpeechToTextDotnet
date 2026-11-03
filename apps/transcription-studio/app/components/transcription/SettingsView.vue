<script setup lang="ts">
import { shallowRef } from 'vue'
import LocationSettingsForm from './LocationSettingsForm.vue'
import CopySettings from './CopySettings.vue'
import ProcessingSettings from './ProcessingSettings.vue'
import PlaybackSettings from './PlaybackSettings.vue'

const tabs = [{ id: 'folders', label: 'Folders' }, { id: 'clipboard', label: 'Clipboard' }, { id: 'processing', label: 'Transcript' }, { id: 'playback', label: 'Playback' }] as const
const selected = shallowRef<(typeof tabs)[number]['id']>('folders')
function navigate(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = tabs.findIndex(tab => tab.id === selected.value)
  selected.value = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!.id
  ;(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#settings-${selected.value}-tab`)?.focus()
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl" aria-label="Settings">
    <div class="overflow-hidden rounded-md border-2 border-fb-border">
      <div role="tablist" aria-label="Settings" class="flex gap-5 border-b border-fb-border px-6" @keydown="navigate">
        <button v-for="tab in tabs" :id="`settings-${tab.id}-tab`" :key="tab.id" type="button" role="tab" :aria-selected="selected === tab.id" :aria-controls="`settings-${tab.id}-panel`" :tabindex="selected === tab.id ? 0 : -1" class="border-b-2 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-fb-primary" :class="selected === tab.id ? 'border-fb-primary text-fb-primary' : 'border-transparent text-fb-muted hover:text-fb-foreground'" @click="selected = tab.id">{{ tab.label }}</button>
      </div>
      <!-- Keep panels mounted so switching tabs preserves unsaved folder edits. -->
      <div v-show="selected === 'folders'" id="settings-folders-panel" role="tabpanel" aria-labelledby="settings-folders-tab" tabindex="0" class="p-6"><LocationSettingsForm /></div>
      <div v-show="selected === 'clipboard'" id="settings-clipboard-panel" role="tabpanel" aria-labelledby="settings-clipboard-tab" tabindex="0" class="p-6"><CopySettings /></div>
      <div v-show="selected === 'processing'" id="settings-processing-panel" role="tabpanel" aria-labelledby="settings-processing-tab" tabindex="0" class="p-6"><ProcessingSettings /></div>
      <div v-show="selected === 'playback'" id="settings-playback-panel" role="tabpanel" aria-labelledby="settings-playback-tab" tabindex="0" class="p-6"><PlaybackSettings /></div>
    </div>
  </section>
</template>
