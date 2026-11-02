<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiCard from '#layers/freebore-ui/app/components/ui/UiCard.vue'
import UiSelect from '#layers/freebore-ui/app/components/ui/UiSelect.vue'
import type { BackendId, BackendInfo, RunPreset } from '../../../shared/studio'

const props = defineProps<{
  backends: readonly Readonly<BackendInfo>[]
  prepared: boolean
  busy: boolean
  running: boolean
}>()
const emit = defineEmits<{ start: [backend: BackendId, preset: RunPreset]; cancel: [] }>()
const backend = shallowRef<BackendId | null>(null)
const preset = shallowRef<RunPreset>('smoke')
const selected = computed(() => props.backends.find(item => item.id === backend.value))
const options = computed(() => props.backends.map(item => ({
  value: item.id, label: `${item.name}${item.available ? '' : ' · unavailable'}`, disabled: !item.available,
})))
const presets = [{ value: 'smoke', label: 'Smoke · short excerpt' }, { value: 'full', label: 'Full · entire recording' }]
watch(() => props.backends, (backends) => {
  if (!backends.some(item => item.id === backend.value && item.available)) {
    backend.value = backends.find(item => item.available)?.id ?? null
  }
}, { immediate: true })

function chooseBackend(value: string | number) {
  if (props.backends.some(item => item.id === value && item.available)) backend.value = value as BackendId
}
function choosePreset(value: string | number) {
  if (value === 'smoke' || value === 'full') preset.value = value
}
function start() {
  if (backend.value && selected.value?.available && props.prepared && !props.running && !props.busy) {
    emit('start', backend.value, preset.value)
  }
}
</script>

<template>
  <UiCard as="section" class="bg-fb-surface-muted/25 p-5">
    <h2 class="text-base font-medium">Run benchmark</h2>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <label for="backend" class="mb-2 block text-xs text-fb-muted">Inference backend</label>
        <UiSelect id="backend" :model-value="backend" :options="options" placeholder="No backend available" :disabled="busy || running" @update:model-value="chooseBackend" />
      </div>
      <div>
        <label for="preset" class="mb-2 block text-xs text-fb-muted">Benchmark scope</label>
        <UiSelect id="preset" :model-value="preset" :options="presets" :disabled="busy || running" @update:model-value="choosePreset" />
      </div>
    </div>
    <p class="mt-3 min-h-5 text-xs text-fb-muted">{{ selected ? `${selected.acceleration} · ${selected.description}` : 'Install a supported local backend to begin.' }}</p>
    <div class="mt-5 flex flex-wrap items-center gap-3">
      <UiButton tone="sky" class="cursor-default" :disabled="!prepared || !selected?.available || busy || running" @click="start">{{ busy ? 'Working…' : 'Start benchmark' }}</UiButton>
      <UiButton v-if="running" tone="rose" class="cursor-default" :disabled="busy" @click="emit('cancel')">Cancel active run</UiButton>
    </div>
  </UiCard>
</template>
