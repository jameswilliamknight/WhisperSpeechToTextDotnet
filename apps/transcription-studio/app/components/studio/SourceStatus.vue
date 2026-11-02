<script setup lang="ts">
import UiCard from '#layers/freebore-ui/app/components/ui/UiCard.vue'
import type { SourceInfo } from '../../../shared/studio'
import { bytesLabel, timestamp } from '../../utils/studioFormat'

defineProps<{ source: Readonly<SourceInfo> }>()
</script>

<template>
  <UiCard as="section" class="bg-fb-surface-muted/25 p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-base font-medium">Source</h2>
      <span class="text-xs" :class="source.prepared ? 'text-fb-success' : 'text-fb-warning'">
        {{ source.prepared ? 'Ready' : 'Not prepared' }}
      </span>
    </div>
    <dl class="mt-5 grid grid-cols-3 gap-3 border-t border-fb-border pt-4 text-sm">
      <div><dt class="text-xs text-fb-muted">Duration</dt><dd class="mt-1 font-mono tabular-nums">{{ timestamp(source.durationSeconds) }}</dd></div>
      <div><dt class="text-xs text-fb-muted">Size</dt><dd class="mt-1 font-mono tabular-nums">{{ bytesLabel(source.bytes) }}</dd></div>
      <div><dt class="text-xs text-fb-muted">Integrity</dt><dd class="mt-1">{{ source.sha256 && source.verifiedAt ? 'Verified' : 'Not verified' }}</dd></div>
    </dl>
    <p v-if="!source.prepared" class="mt-4 text-sm text-fb-warning">Prepare the source using the local harness, then refresh.</p>
  </UiCard>
</template>
