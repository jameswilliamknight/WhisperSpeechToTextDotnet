import { expect, test } from 'bun:test'
import { transcriptPassages } from '../../shared/transcriptPassages'

test('merges word-level records without changing raw segments', () => {
  const words = [
    { start: 5, end: 5.2, text: 'you', speaker: 'a' },
    { start: 5.3, end: 6, text: ' know,', speaker: 'a' },
    { start: 6, end: 6.2, text: 'several', speaker: 'a' },
    { start: 6.2, end: 6.6, text: 'things', speaker: 'a' },
  ]
  const original = structuredClone(words)
  expect(transcriptPassages(words)).toEqual([{ start: 5, end: 6.6, text: 'you know, several things', speaker: 'a', sources: words }])
  expect(words).toEqual(original)
})

test('retains speaker changes, pauses and punctuation', () => {
  const passages = transcriptPassages([
    { start: 0, end: 1, text: 'Hello', speaker: 'a' },
    { start: 1, end: 1.1, text: ',', speaker: 'a' },
    { start: 1.1, end: 2, text: 'world.', speaker: 'a' },
    { start: 2, end: 3, text: 'Reply', speaker: 'b' },
    { start: 3, end: 4, text: 'Again', speaker: 'a' },
    { start: 6, end: 7, text: 'After a pause', speaker: 'a' },
  ])
  expect(passages).toHaveLength(4)
  expect(passages[0]?.text).toBe('Hello, world.')
  expect(passages[3]?.start).toBe(6)
})
