import { expect, test } from 'bun:test'
import type { SpeakerTurn, TranscriptSegment } from '#shared/studio'
import { speakerSegments } from '#shared/speakerSegments'
import { transcriptPassages } from '#shared/transcriptPassages'
import { alignedWords } from '#shared/wordAlignment'
import { formatTranscript } from '#shared/transcriptText'
import { processingFromToggles, normaliseProcessingToggles, processingToggleDefaults } from '#shared/transcriptProcessing'
import { highlightText } from '~/utils/transcriptHighlight'

function segment(text: string, times: [number, number][], speaker = 'A'): TranscriptSegment {
  let offset = 0
  const words = text.split(' ').map((word, index) => {
    const value = { from: offset, to: offset + word.length, start: times[index]![0], end: times[index]![1] }
    offset += word.length + 1
    return value
  })
  const source = { text, start: times[0]![0], end: times.at(-1)![1] }
  return { ...source, speaker, alignment: { version: 1, source, words } }
}
const evidence: SpeakerTurn[] = [{ start: 0, end: 1, speaker: 'A' }, { start: 2.7, end: 5, speaker: 'A' }]
const opening = segment('Alpha small bridge omega.', [[0, 1], [1, 1.7], [1.7, 2.3], [2.3, 3]])

test('bounded unlabelled words condense using word neighbours even beyond the diarisation gap limit', () => {
  const before = JSON.stringify(opening)
  const passages = transcriptPassages([opening], 1.5, evidence)
  expect(passages.map(value => [value.speaker, value.text])).toEqual([['A', opening.text]])
  expect(speakerSegments([opening], evidence, { condenseUnlabelled: false }).map(value => value.speaker)).toEqual(['A', undefined, 'A'])
  expect(passages.flatMap(value => value.sources.flatMap(alignedWords))).toEqual(alignedWords(opening))
  expect(highlightText(passages[0]!.sources, evidence).ranges.every(range => evidence[range.turn]!.speaker === 'A')).toBe(true)
  expect(highlightText([opening], evidence).ranges.every(range => evidence[range.turn]!.speaker === 'A')).toBe(true)
  expect(JSON.stringify(opening)).toBe(before)
})

test('a supported two-speaker boundary tie and following uncovered fragment join the new speaker', () => {
  const source = segment('Earlier tiny phrase small bridge onward.', [[0, 0.5], [0.5, 0.7], [0.7, 2.06], [2.06, 2.93], [2.98, 3.42], [3.42, 3.92]])
  const turns: SpeakerTurn[] = [
    { start: 0, end: 0.7, speaker: 'B' }, { start: 0.5, end: 1.829, speaker: 'A' },
    { start: 3.701, end: 5, speaker: 'A' },
  ]
  const passages = transcriptPassages([source], 1.5, turns)
  expect(passages.map(value => [value.speaker, value.text])).toEqual([['B', 'Earlier'], ['A', 'tiny phrase small bridge onward.']])
  for (const passage of passages) expect(highlightText(passage.sources, turns).ranges.every(range => turns[range.turn]!.speaker === passage.speaker)).toBe(true)
  const result = { segments: [source], turns, stages: {}, metadata: { runtime: 'test', models: [], backend: 'test' }, warnings: [] }
  expect(formatTranscript(result, true, { A: 'Reader', B: 'Guest' })).toBe('Guest: Earlier\nReader: tiny phrase small bridge onward.\n')
  const conflicting = [...turns, { start: 0.5, end: 0.7, speaker: 'C' }]
  expect(speakerSegments([source], conflicting).some(value => !value.speaker && value.text === 'tiny')).toBe(true)
})

test('weak short islands need agreeing source and neighbours; explicit interjections survive', () => {
  const source = segment('Alpha beta omega.', [[0, 1], [1, 2], [2, 3]])
  const turns = [{ start: 0, end: 1, speaker: 'A' }, { start: 1.2, end: 1.7, speaker: 'B' }, { start: 2, end: 3, speaker: 'A' }]
  expect(transcriptPassages([source], 1.5, turns).map(value => value.text)).toEqual([source.text])
  expect(speakerSegments([source], turns, { smoothSpeakerIslands: false }).map(value => value.speaker)).toEqual(['A', 'B', 'A'])
  expect(speakerSegments([source], turns.map(turn => turn.speaker === 'B' ? { ...turn, start: 1, end: 2 } : turn)).map(value => value.speaker)).toEqual(['A', 'B', 'A'])
  expect(speakerSegments([{ ...source, speaker: 'B' }], turns).map(value => value.speaker)).toEqual(['A', 'B', 'A'])
})

test('long pauses, unbounded fragments and more than three uncertain words stay explicit', () => {
  const long = segment('Alpha beta omega.', [[0, 1], [1.1, 1.4], [4, 5]])
  const turns = [{ start: 0, end: 1, speaker: 'A' }, { start: 4, end: 5, speaker: 'A' }]
  expect(speakerSegments([long], turns).map(value => value.speaker)).toEqual(['A', undefined, 'A'])
  expect(speakerSegments([opening], evidence.slice(1)).map(value => value.speaker)).toEqual([undefined, 'A'])
  const many = segment('Alpha one two three four omega.', [[0, 1], [1, 1.2], [1.2, 1.4], [1.4, 1.6], [1.6, 1.8], [1.8, 3]])
  expect(speakerSegments([many], evidence).map(value => value.speaker)).toEqual(['A', undefined, 'A'])
})

test('all-false switches retain the baseline and individual opt-outs affect only their rule', () => {
  expect(Object.values(processingToggleDefaults)).toEqual([false, false, false, false, false])
  expect(normaliseProcessingToggles()).toEqual(processingToggleDefaults)
  expect(processingFromToggles({ disableGrouping: true }).groupSameSpeaker).toBe(false)
  const source = [segment('Alpha', [[0, 1]]), segment('omega.', [[1, 2]])]
  expect(transcriptPassages(source)).toHaveLength(1)
  expect(transcriptPassages(source, 1.5, [], processingFromToggles({ disableGrouping: true }))).toHaveLength(2)
  const gap = segment('Alpha bridge omega.', [[0, 1], [1, 1.5], [1.5, 2]])
  const turns = [{ start: 0, end: 1, speaker: 'A' }, { start: 1.5, end: 2, speaker: 'A' }]
  expect(speakerSegments([gap], turns, { bridgeShortGaps: false, condenseUnlabelled: false }).map(value => value.speaker)).toEqual(['A', undefined, 'A'])
  const result = { segments: source, turns: [{ start: 0, end: 1, speaker: 'A' }, { start: 1, end: 2, speaker: 'B' }], stages: {}, metadata: { runtime: 'test', models: [], backend: 'test' }, warnings: [] }
  expect(formatTranscript(result, false)).toBe('Alpha omega.\n')
  expect(formatTranscript(result, false, {}, { plainCopyFlow: false })).toBe('Alpha\nomega.\n')
})
