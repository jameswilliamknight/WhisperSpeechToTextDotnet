import { expect, test } from 'bun:test'
import { median, summariseRuns } from '../../shared/benchmark-summary'
import type { BenchmarkRun } from '../../shared/studio'

const run: BenchmarkRun = {
  id: 'fixture', backend: 'nemo', preset: 'full', status: 'succeeded', phase: 'Complete',
  startedAt: '', durationSeconds: 100, wallSeconds: 10, realTimeFactor: 10,
  sourceSha256: 'a', integrityVerified: true,
  result: { segments: [], turns: [], stages: {}, warnings: [], metadata: { runtime: 'fixture', models: ['v1'], backend: 'test' } },
}

test('median and scope/source/model-safe aggregation', () => {
  expect(median([20, 10, 30])).toBe(20)
  expect(median([1, 3])).toBe(2)
  const summaries = summariseRuns([
    run, { ...run, wallSeconds: 20 }, { ...run, wallSeconds: 30 },
    { ...run, preset: 'smoke' }, { ...run, status: 'failed' }, { ...run, integrityVerified: false },
    { ...run, sourceSha256: 'different' },
    { ...run, result: { ...run.result!, metadata: { ...run.result!.metadata, models: ['v2'] } } },
  ])
  expect(summaries).toHaveLength(3)
  expect(summaries[0]?.count).toBe(3)
  expect(summaries[0]?.seconds).toBe(20)
})
