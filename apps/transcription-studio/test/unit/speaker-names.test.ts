import { describe, expect, test } from 'bun:test'
import { normaliseSpeakerNames, speakerIds, speakerLabels, workerSpeakerLabels } from '../../shared/speakerNames'
import type { WorkerResult } from '../../shared/studio'

const result: WorkerResult = {
  segments: [
    { start: 0, end: 1, text: 'Hi', speaker: 'B' },
    { start: 1, end: 2, text: 'Yo', speaker: 'segment-only' },
    { start: 2, end: 3, text: 'Unlabelled' },
  ],
  turns: [{ start: 0, end: 3, speaker: 'A' }, { start: 0, end: 3, speaker: 'B' }],
  stages: {}, metadata: { runtime: 'test', models: [], backend: 'test' }, warnings: [],
}

describe('speaker name labels', () => {
  test('keeps stable turn-first ids and default labels', () => {
    expect(speakerIds(result)).toEqual(['A', 'B', 'segment-only'])
    expect([...workerSpeakerLabels(result)]).toEqual([['A', 'Speaker 1'], ['B', 'Speaker 2'], ['segment-only', 'Speaker 3']])
  })

  test('applies trimmed renames and falls back to numbered labels', () => {
    expect([...speakerLabels(['A', 'B'], { A: '  Alice  ', B: '   ' })]).toEqual([['A', 'Alice'], ['B', 'Speaker 2']])
  })

  test('rejects unknown, overlong and control-character names', () => {
    expect(() => normaliseSpeakerNames(result, { unknown: 'X' })).toThrow(/Unknown/)
    expect(() => normaliseSpeakerNames(result, { A: 'x'.repeat(61) })).toThrow(/60/)
    expect(() => normaliseSpeakerNames(result, { A: 'bad\nname' })).toThrow(/control/)
    expect(normaliseSpeakerNames(result, { A: ' Alice ', B: '' })).toEqual({ A: 'Alice' })
  })
})
