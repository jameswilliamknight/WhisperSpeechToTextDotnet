<script setup lang="ts">
import { shallowRef } from 'vue'
import LocationSettingsForm from './LocationSettingsForm.vue'
import CopySettings from './CopySettings.vue'

const selected = shallowRef<'folders' | 'clipboard'>('folders')
const tabs = [{ id: 'folders', label: 'Folders' }, { id: 'clipboard', label: 'Clipboard' }] as const
function navigate(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  selected.value = event.key === 'Home' ? 'folders' : event.key === 'End' ? 'clipboard' : selected.value === 'folders' ? 'clipboard' : 'folders'
  ;(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#settings-${selected.value}-tab`)?.focus()
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl" aria-label="Settings">
    <div class="overflow-hidden rounded-md border border-fb-border">
      <div role="tablist" aria-label="Settings" class="flex gap-5 border-b border-fb-border px-6" @keydown="navigate">
        <button v-for="tab in tabs" :id="`settings-${tab.id}-tab`" :key="tab.id" type="button" role="tab" :aria-selected="selected === tab.id" :aria-controls="`settings-${tab.id}-panel`" :tabindex="selected === tab.id ? 0 : -1" class="border-b-2 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-fb-primary" :class="selected === tab.id ? 'border-fb-primary text-fb-primary' : 'border-transparent text-fb-muted hover:text-fb-foreground'" @click="selected = tab.id">{{ tab.label }}</button>
      </div>
      <!-- Keep panels mounted so switching tabs preserves unsaved folder edits. -->
      <div v-show="selected === 'folders'" id="settings-folders-panel" role="tabpanel" aria-labelledby="settings-folders-tab" tabindex="0" class="p-6"><LocationSettingsForm /></div>
      <div v-show="selected === 'clipboard'" id="settings-clipboard-panel" role="tabpanel" aria-labelledby="settings-clipboard-tab" tabindex="0" class="p-6"><CopySettings /></div>
    </div>
  </section>
</template>
