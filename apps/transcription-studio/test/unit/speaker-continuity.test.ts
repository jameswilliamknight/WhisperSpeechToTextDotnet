import { expect, test } from 'bun:test'
import type { SpeakerTurn, TranscriptSegment } from '#shared/studio'
import { wordOwner } from '#shared/wordSpeaker'
import { transcriptPassages } from '#shared/transcriptPassages'
import { formatTranscript } from '#shared/transcriptText'
import { alignedWords } from '#shared/wordAlignment'
import { highlightText } from '~/utils/transcriptHighlight'

const turns: SpeakerTurn[] = [{ start: 0, end: 1, speaker: 'A' }, { start: 2, end: 4, speaker: 'A' }]
const segments: TranscriptSegment[] = [
  { start: 0, end: 1, text: 'Alpha', speaker: 'A' },
  { start: 1.2, end: 1.8, text: 'and', speaker: 'B' },
  { start: 2, end: 4, text: 'omega.', speaker: 'A' },
].map(source => ({ ...source, alignment: { version: 1, source: { start: source.start, end: source.end, text: source.text }, words: [
  { from: 0, to: source.text.length, start: source.start, end: source.end },
] } }))

test('a short uncovered word between same-speaker turns stays in one readable passage across ASR segments', () => {
  const before = JSON.stringify({ segments, turns })
  const passages = transcriptPassages(segments, 1.5, turns)
  expect(passages.map(passage => [passage.speaker, passage.text])).toEqual([['A', 'Alpha and omega.']])
  expect(passages.flatMap(passage => passage.sources.flatMap(alignedWords))).toEqual(segments.flatMap(alignedWords))
  const ranges = passages.flatMap(passage => highlightText(passage.sources, turns).ranges)
  expect(ranges.every(range => turns[range.turn]!.speaker === 'A')).toBe(true)
  expect(highlightText(segments, turns).ranges.some(range => range.from <= 6 && range.to >= 9)).toBe(true)
  const result = { segments, turns, stages: {}, metadata: { runtime: 'test', models: [], backend: 'test' }, warnings: [] }
  expect(formatTranscript(result, true, { A: 'Reader' })).toBe('Reader: Alpha and omega.\n')
  expect(JSON.stringify({ segments, turns })).toBe(before)
})

test('continuity never crosses a different speaker, ambiguous evidence, or a substantial pause', () => {
  const evidence: SpeakerTurn[][] = [
    [turns[0]!, { ...turns[1]!, speaker: 'B' }],
    [{ start: 0, end: 0.2, speaker: 'A' }, turns[1]!],
    [turns[0]!], [turns[1]!], [],
    [...turns, { start: 1.1, end: 1.9, speaker: 'B' }, { start: 1.1, end: 1.9, speaker: 'A' }],
    [...turns, { start: 0, end: 1, speaker: 'B' }],
    [...turns, { start: 2, end: 4, speaker: 'B' }],
  ]
  for (const value of evidence) expect(wordOwner(1.2, 1.8, value)).toBe(-1)
})

test('real competing speaker evidence wins over continuity; turn order cannot change the assigned speaker', () => {
  const evidence = [...turns, { start: 1.3, end: 1.7, speaker: 'B' }]
  expect(evidence[wordOwner(1.2, 1.8, evidence)]!.speaker).toBe('B')
  for (const value of [turns, [...turns].reverse()]) expect(value[wordOwner(1.2, 1.8, value)]?.speaker).toBe('A')
})

test('the limit applies to the entire uncovered interval, not independently to each short word', () => {
  const short: SpeakerTurn[] = [{ start: 0, end: 1, speaker: 'A' }, { start: 2.5, end: 4, speaker: 'A' }]
  expect(short[wordOwner(1.2, 1.8, short)]?.speaker).toBe('A')
  const long = [short[0]!, { ...short[1]!, start: 2.51 }]
  for (const [start, end] of [[1.1, 1.2], [1.3, 1.4], [2.2, 2.3]]) expect(wordOwner(start!, end!, long)).toBe(-1)
})
