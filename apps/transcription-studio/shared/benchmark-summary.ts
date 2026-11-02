import type { BenchmarkRun } from './studio'
import type { DeepReadonly } from 'vue'

export function median(values: readonly number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Never combine smoke/full scopes, different source bytes, model versions or acceleration backends. */
export function summariseRuns(runs: readonly DeepReadonly<BenchmarkRun>[]) {
  const groups = new Map<string, { backend: string; times: number[]; speeds: number[] }>()
  for (const run of runs) {
    if (run.preset !== 'full' || run.status !== 'succeeded' || !run.integrityVerified || !run.sourceSha256 || !run.result || !run.wallSeconds || !run.realTimeFactor) continue
    const key = JSON.stringify([run.backend, run.sourceSha256, run.durationSeconds, run.result.metadata])
    const group = groups.get(key) ?? { backend: run.backend, times: [], speeds: [] }
    group.times.push(run.wallSeconds); group.speeds.push(run.realTimeFactor)
    groups.set(key, group)
  }
  return [...groups].map(([key, group]) => ({
    key, backend: group.backend, count: group.times.length, seconds: median(group.times),
    min: Math.min(...group.times), max: Math.max(...group.times), speed: median(group.speeds),
  }))
}
