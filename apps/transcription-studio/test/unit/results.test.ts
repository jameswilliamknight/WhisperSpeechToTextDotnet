import { describe, expect, test } from 'bun:test'
import { parseWorkerResult } from '../../harness/backends/result'

const result = {
  segments: [{ start: 0, end: 1, text: 'Synthetic fixture', speaker: 'speaker-1' }],
  turns: [{ start: 0, end: 1, speaker: 'speaker-1' }, { start: 0.5, end: 1, speaker: 'speaker-2' }],
  metadata: { runtime: 'test-only', models: ['synthetic'], backend: 'fixture' },
}

describe('worker result validation', () => {
  test('retains overlapping speaker turns and supplies optional defaults', () => {
    const parsed = parseWorkerResult(result)
    expect(parsed.turns).toHaveLength(2)
    expect(parsed.stages).toEqual({})
    expect(parsed.warnings).toEqual([])
  })
  test('rejects reversed, negative and non-finite timestamps', () => {
    for (const segment of [{ start: 2, end: 1 }, { start: -1, end: 1 }, { start: 0, end: Infinity }]) {
      expect(() => parseWorkerResult({ ...result, segments: [{ ...segment, text: 'Fixture' }] })).toThrow()
    }
  })
})
