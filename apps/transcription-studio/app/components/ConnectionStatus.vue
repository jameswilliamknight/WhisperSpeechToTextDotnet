<script setup lang="ts">
import { shallowRef, watch } from 'vue'

const props = defineProps<{ reconnecting: boolean }>()
const visible = shallowRef(false)
// SSE reconnects normally during local reloads. Only persistent interruptions
// deserve feedback; cancellation on recovery/unmount prevents stale flashes.
watch(() => props.reconnecting, (reconnecting, _, onCleanup) => {
  visible.value = false
  if (!reconnecting) return
  const timer = setTimeout(() => { visible.value = true }, 1500)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })
</script>

<template>
  <div role="status" aria-live="polite" aria-atomic="true" data-testid="connection-status" class="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-fb-muted">
    <span v-if="visible">Reconnecting to recording updates…</span>
  </div>
</template>
