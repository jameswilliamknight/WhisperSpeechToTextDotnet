<script setup lang="ts">
import UiToggleSwitch from '#layers/freebore-ui/app/components/ui/UiToggleSwitch.vue'
import { useWorkspaceStore } from '../../stores/workspace'

const workspace = useWorkspaceStore()
</script>

<template>
  <section v-if="workspace.snapshot" aria-labelledby="copy-settings-heading" class="space-y-3">
    <h2 id="copy-settings-heading" class="font-medium">Clipboard preferences</h2>
    <label class="flex items-center gap-2 text-sm">
      <UiToggleSwitch :model-value="workspace.preferences.copyWithSpeakers" aria-label="Copy with speaker labels" :disabled="workspace.busy" @update:model-value="workspace.savePreferences({ copyWithSpeakers: $event })" />
      Copy with Speaker Labels
    </label>
  </section>
</template>
