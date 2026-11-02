import { expect, test } from 'bun:test'
import { formatTranscript } from '../../shared/transcriptText'
import type { WorkerResult } from '../../shared/studio'

test('clipboard and text files use passage grouping and the same stable speaker labels as the UI', () => {
  const result: WorkerResult = {
    segments: [
      { start: 0, end: 0.5, text: 'Hello', speaker: 'opaque-b' },
      { start: 0.5, end: 1, text: ',', speaker: 'opaque-b' },
      { start: 1, end: 1.5, text: 'world.', speaker: 'opaque-b' },
      { start: 2, end: 3, text: 'Another person.', speaker: 'segment-only' },
      { start: 3, end: 4, text: 'No assignment.' },
    ],
    turns: [{ start: 0, end: 4, speaker: 'opaque-a' }, { start: 0, end: 4, speaker: 'opaque-b' }],
    stages: {}, metadata: { runtime: 'test', models: [], backend: 'test' }, warnings: [],
  }
  expect(formatTranscript(result, true)).toBe('Speaker 2: Hello, world.\nSpeaker 3: Another person.\nUnlabelled: No assignment.\n')
  expect(formatTranscript(result, true, { 'opaque-b': 'Alice' })).toBe('Alice: Hello, world.\nSpeaker 3: Another person.\nUnlabelled: No assignment.\n')
  expect(formatTranscript(result, false)).toBe('Hello, world.\nAnother person.\nNo assignment.\n')
  expect(result.segments).toHaveLength(5)
})
