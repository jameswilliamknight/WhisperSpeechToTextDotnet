<script setup lang="ts">
import UiToggleSwitch from '#layers/freebore-ui/app/components/ui/UiToggleSwitch.vue'
import { computed } from 'vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { normaliseProcessingToggles } from '#shared/transcriptProcessing'
import type { TranscriptProcessingToggles } from '#shared/transcriptProcessing'

const workspace = useWorkspaceStore()
const options = computed(() => normaliseProcessingToggles(workspace.preferences.transcriptProcessing))
const features: { key: keyof TranscriptProcessingToggles; label: string; description: string }[] = [
  { key: 'disableGrouping', label: 'Disable same-speaker grouping', description: 'Normally combines adjacent text with the same speaker, keeping pauses longer than 1.5 seconds separate.' },
  { key: 'disableGapBridging', label: 'Disable short-gap bridging', description: 'Normally labels uncovered words when the entire gap is at most 1.5 seconds and both bounding speaker turns agree.' },
  { key: 'disableUnlabelledCondensing', label: 'Disable unlabelled-fragment condensing', description: 'Normally infers up to 3 words / 1.5 seconds from agreeing neighbours. At a speaker boundary, the original segment and an adjacent owned word must agree; only a supported two-speaker tie can be resolved.' },
  { key: 'disableIslandCorrection', label: 'Disable weak speaker-island correction', description: 'Normally corrects up to 3 words / 1.2 seconds when both neighbours and the original segment agree, and competing speaker coverage is weak. Clearly evidenced interjections stay separate.' },
  { key: 'disablePlainCopyFlow', label: 'Disable flowing plain copies', description: 'Normally keeps sentence flow when copying without labels. Turn this on to retain speaker-change line breaks instead.' },
]
function update(key: keyof TranscriptProcessingToggles, value: boolean) {
  void workspace.savePreferences({ transcriptProcessing: { ...options.value, [key]: value } })
}
</script>

<template>
  <section v-if="workspace.snapshot" aria-labelledby="processing-settings-heading" class="space-y-5">
    <div class="space-y-2">
      <h2 id="processing-settings-heading" class="font-medium">Transcript postprocessing</h2>
      <p class="text-sm text-fb-muted">All switches off is the recommended baseline. Turn a switch on to disable that rule. Changes save automatically and apply to both review screens and clipboard copies; original results, audio and word timings are unchanged.</p>
    </div>
    <label v-for="feature in features" :key="feature.key" class="flex items-start gap-3 text-sm">
      <UiToggleSwitch :model-value="options[feature.key]" :aria-label="feature.label" :aria-describedby="`processing-${feature.key}-description`" :disabled="workspace.busy" @update:model-value="update(feature.key, $event)" />
      <span class="space-y-1">
        <span class="block font-medium">{{ feature.label }}</span>
        <span :id="`processing-${feature.key}-description`" class="block text-fb-muted">{{ feature.description }}</span>
      </span>
    </label>
  </section>
</template>
