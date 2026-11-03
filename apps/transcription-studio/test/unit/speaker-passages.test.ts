import { expect, test } from 'bun:test'
import { transcriptPassages } from '#shared/transcriptPassages'
import { highlightText } from '~/utils/transcriptHighlight'
import type { TranscriptSegment } from '#shared/studio'
import { speakerSegments } from '#shared/speakerSegments'
import { alignedWords } from '#shared/wordAlignment'
import { formatTranscript } from '#shared/transcriptText'

const turns = [{ start: 0, end: 1.449, speaker: 'A' }, { start: 1.131, end: 2.159, speaker: 'B' }, { start: 1.851, end: 4.939, speaker: 'A' }]
const source = { start: 0, end: 4.74, text: 'Alpha beta gamma.' }
const segment: TranscriptSegment = { ...source, speaker: 'A', alignment: { version: 1, source, words: [
  { from: 0, to: 5, start: 0.1, end: 0.9 }, { from: 6, to: 10, start: 1.5, end: 1.8 }, { from: 11, to: 17, start: 2.3, end: 4 },
] } }

test('passage labels agree with every owned word through an A/B/A change inside one source segment', () => {
  const passages = transcriptPassages([segment], 1.5, turns)
  expect(passages.map(passage => [passage.speaker, passage.text])).toEqual([['A', 'Alpha'], ['B', 'beta'], ['A', 'gamma.']])
  for (const passage of passages) {
    for (const range of highlightText(passage.sources, turns).ranges) expect(turns[range.turn]!.speaker).toBe(passage.speaker!)
  }
})

test('projection preserves source records, every word, punctuation and native word timings', () => {
  const before = JSON.stringify(segment)
  const projected = speakerSegments([segment], turns)
  expect(projected.map(value => value.text).join(' ')).toBe(source.text)
  expect(projected.flatMap(value => alignedWords(value).map(word => [word.start, word.end]))).toEqual(segment.alignment!.words.map(word => [word.start, word.end]))
  expect(projected.every(value => alignedWords(value).length === 1)).toBe(true)
  expect(JSON.stringify(segment)).toBe(before)
})

test('same-speaker turn boundaries do not fragment readable passages', () => {
  expect(transcriptPassages([segment], 1.5, turns.map(turn => ({ ...turn, speaker: 'A' })))).toHaveLength(1)
})

test('without contextual condensing, ambiguous or long uncovered gaps stay unlabelled', () => {
  for (const evidence of [[turns[0]!, { ...turns[2]!, start: 3.1 }], [...turns, { ...turns[1]!, speaker: 'C' }]]) {
    const projected = speakerSegments([segment], evidence, { condenseUnlabelled: false })
    expect(projected.map(value => value.speaker)).toEqual(['A', undefined, 'A'])
    expect(highlightText([projected[1]!], evidence, { condenseUnlabelled: false }).ranges).toEqual([])
  }
})

test('legacy, invalid alignment and absent diarisation retain segment-level labels', () => {
  for (const value of [{ ...segment, alignment: undefined }, { ...segment, text: 'Edited.' }]) {
    expect(speakerSegments([value], turns)).toEqual([value])
  }
  expect(speakerSegments([segment], [])).toEqual([segment])
})

test('labelled copying uses displayed assignments while plain copying remains coherent', () => {
  const result = { segments: [segment], turns, stages: {}, metadata: { runtime: 'test', models: [], backend: 'whisper' }, warnings: [] }
  expect(formatTranscript(result, true, { A: 'Reader', B: 'Guest' })).toBe('Reader: Alpha\nGuest: beta\nReader: gamma.\n')
  expect(formatTranscript(result, false)).toBe('Alpha beta gamma.\n')
})
