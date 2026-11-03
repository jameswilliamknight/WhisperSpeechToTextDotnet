<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import type { BenchmarkRun } from '../../../shared/studio'
import { bytesLabel, secondsLabel, timestamp } from '../../utils/studioFormat'

defineProps<{ runs: readonly DeepReadonly<BenchmarkRun>[]; selectedId?: string; now: number }>()
defineEmits<{ select: [id: string] }>()

function elapsed(run: DeepReadonly<BenchmarkRun>, now: number) {
  if (run.wallSeconds !== undefined) return secondsLabel(run.wallSeconds)
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now
  return secondsLabel(Math.max(0, (end - Date.parse(run.startedAt)) / 1000))
}
function speakers(run: DeepReadonly<BenchmarkRun>) {
  if (!run.result) return '—'
  const labels = [...run.result.turns.map(turn => turn.speaker), ...run.result.segments.flatMap(segment => segment.speaker ? [segment.speaker] : [])]
  return new Set(labels).size || 'Not labelled'
}
function speed(run: DeepReadonly<BenchmarkRun>) {
  return run.realTimeFactor !== undefined && run.realTimeFactor > 0 ? `${run.realTimeFactor.toFixed(2)}×` : '—'
}
const statusClasses: Record<BenchmarkRun['status'], string> = {
  running: 'text-fb-primary', succeeded: 'text-fb-success', failed: 'text-fb-danger',
  cancelled: 'text-fb-muted', interrupted: 'text-fb-warning',
}
</script>

<template>
  <section aria-labelledby="runs-heading" class="min-w-0 overflow-hidden rounded-md border border-fb-border">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-fb-border px-5 py-4">
      <h2 id="runs-heading" class="text-base font-medium">Benchmark runs</h2>
      <span class="text-xs text-fb-muted">{{ runs.length }} {{ runs.length === 1 ? 'run' : 'runs' }}</span>
    </div>
    <div v-if="!runs.length" class="px-5 py-12 text-center">
      <p class="text-sm text-fb-foreground-muted">No benchmarks yet</p>
    </div>
    <div v-else class="scrollbar-area hover-scrollbar overflow-x-auto">
      <table class="w-full min-w-[760px] text-left text-sm">
        <caption class="sr-only">Local benchmark results. Select a run to review its transcript.</caption>
        <thead class="bg-fb-surface-muted/30 text-xs text-fb-muted">
          <tr><th scope="col" class="px-5 py-3 font-normal">Backend / scope</th><th scope="col" class="px-3 py-3 font-normal">Status</th><th scope="col" class="px-3 py-3 font-normal">Audio</th><th scope="col" class="px-3 py-3 font-normal">Elapsed</th><th scope="col" class="px-3 py-3 font-normal">RTFx</th><th scope="col" class="px-3 py-3 font-normal">Peak memory</th><th scope="col" class="px-3 py-3 font-normal">Speakers</th></tr>
        </thead>
        <tbody class="divide-y divide-fb-border">
          <tr v-for="run in runs" :key="run.id" :class="run.id === selectedId ? 'bg-fb-primary-soft/20' : ''">
            <th scope="row" class="px-3 py-3 font-normal">
              <UiButton variant="naked" class="cursor-default justify-start text-left" :aria-pressed="run.id === selectedId" :aria-label="`Review ${run.backend} ${run.preset} run`" @click="$emit('select', run.id)">
                <span><span class="block capitalize">{{ run.backend }}</span><span class="mt-0.5 block text-xs font-normal text-fb-muted">{{ run.preset }} <span v-if="run.id === selectedId" class="text-fb-primary">· selected</span></span></span>
              </UiButton>
            </th>
            <td class="px-3 py-3 capitalize" :class="statusClasses[run.status]">{{ run.status }}</td>
            <td class="px-3 py-3 font-mono text-xs tabular-nums">{{ timestamp(run.durationSeconds) }}</td>
            <td class="px-3 py-3 font-mono text-xs tabular-nums">{{ elapsed(run, now) }}</td>
            <td class="px-3 py-3 font-mono text-xs tabular-nums">{{ speed(run) }}</td>
            <td class="px-3 py-3 font-mono text-xs tabular-nums">{{ bytesLabel(run.peakMemoryBytes) }}</td>
            <td class="px-3 py-3 text-xs">{{ speakers(run) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <details class="border-t border-fb-border px-5 py-3 text-xs text-fb-muted">
      <summary>Measurement notes</summary>
      <p class="mt-2 leading-relaxed">Processing times include worker startup and model loading; downloads and input preparation are excluded. RTFx = audio duration ÷ processing time. Memory is the maximum process RSS reported by macOS time, not summed GPU/ANE memory. No accuracy scores without reference annotations.</p>
    </details>
  </section>
</template>
