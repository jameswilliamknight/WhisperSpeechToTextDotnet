<script setup lang="ts">
import UiToggleSwitch from '#layers/freebore-ui/app/components/ui/UiToggleSwitch.vue'
import { useWorkspaceStore } from '~/stores/workspace'

const workspace = useWorkspaceStore()
</script>

<template>
  <section v-if="workspace.snapshot" aria-labelledby="playback-settings-heading" class="space-y-5">
    <h2 id="playback-settings-heading" class="font-medium">Playback performance</h2>
    <label class="flex items-start gap-3 text-sm">
      <UiToggleSwitch :model-value="workspace.preferences.disablePlaybackPulse === true" aria-label="Disable playback pulse" aria-describedby="playback-pulse-description" @update:model-value="workspace.savePreferences({ disablePlaybackPulse: $event })" />
      <span class="space-y-1">
        <span class="block font-medium">Disable playback pulse</span>
        <span id="playback-pulse-description" class="block text-fb-muted">Performance tweak: replaces the pulsing timeline background with a static, very dark grey while playing. Disabling the pulse may improve performance. Play/pause fades remain. Saves automatically and applies to both review screens.</span>
      </span>
    </label>
  </section>
</template>
