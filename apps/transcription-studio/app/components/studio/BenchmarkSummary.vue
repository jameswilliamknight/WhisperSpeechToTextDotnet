<script setup lang="ts">
import { computed } from 'vue'
import type { DeepReadonly } from 'vue'
import type { BenchmarkRun } from '../../../shared/studio'
import { summariseRuns } from '#shared/benchmark-summary'
import { secondsLabel } from '../../utils/studioFormat'

const props = defineProps<{ runs: readonly DeepReadonly<BenchmarkRun>[] }>()
const summaries = computed(() => summariseRuns(props.runs))
</script>

<template>
  <section v-if="summaries.length" class="rounded-md border border-fb-border p-5" aria-labelledby="summary-heading">
    <h2 id="summary-heading" class="mb-4 text-base font-medium">Full-recording summary</h2>
    <div class="grid gap-4 sm:grid-cols-3">
      <dl v-for="summary in summaries" :key="summary.key" class="space-y-2">
        <dt class="text-sm font-medium capitalize">{{ summary.backend }} <span class="font-normal text-fb-muted">· {{ summary.count }} {{ summary.count === 1 ? 'run' : 'runs' }}</span></dt>
        <dd class="font-mono text-lg">{{ secondsLabel(summary.seconds) }} <span class="text-sm text-fb-primary">{{ summary.speed.toFixed(1) }}×</span></dd>
        <dd class="text-xs text-fb-muted">Median · {{ secondsLabel(summary.min) }}–{{ secondsLabel(summary.max) }}</dd>
      </dl>
    </div>
  </section>
</template>
