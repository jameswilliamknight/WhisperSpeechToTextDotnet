import { expect, test } from 'bun:test'
import { activeTurns, highlightText, textPieces, turnHighlightText } from '../../app/utils/transcriptHighlight'
import { alignedWords } from '../../shared/wordAlignment'
import { formatTranscript } from '../../shared/transcriptText'
import { parseWorkerResult } from '../../harness/backends/result'
import type { TranscriptSegment } from '../../shared/studio'

const turns = [{ start: 0, end: 1, speaker: 'A' }, { start: 1, end: 2, speaker: 'A' }, { start: 2, end: 3, speaker: 'B' }]
function segment(): TranscriptSegment {
  const source = { start: 0, end: 3, text: 'Hello there world!' }
  return { ...source, speaker: 'A', alignment: { version: 1, source: { ...source }, words: [
    { from: 0, to: 5, start: 0.1, end: 0.7 }, { from: 6, to: 11, start: 1.1, end: 1.7 }, { from: 12, to: 18, start: 2.1, end: 2.7 },
  ] } }
}
test('adjacent timeline blocks own different words of the same sentence', () => {
  const content = highlightText([segment()], turns)
  expect(content.ranges).toEqual([{ from: 0, to: 5, turn: 0 }, { from: 6, to: 11, turn: 1 }, { from: 12, to: 18, turn: 2 }])
  expect(textPieces(content, [], 1).filter(piece => piece.preview).map(piece => piece.text)).toEqual(['there'])
  expect(textPieces(content, [0], 1).filter(piece => piece.playback).map(piece => piece.text)).toEqual(['Hello'])
})
test('whole fine-grained phrases highlight together and source text stays intact', () => {
  const content = highlightText([segment()], [{ start: 0, end: 3, speaker: 'A' }])
  expect(content.ranges).toEqual([{ from: 0, to: 18, turn: 0 }])
  expect(textPieces(content, [0]).map(piece => piece.text).join('')).toBe(segment().text)
})
test('a word-owned turn can preview a sentence with a different segment-level speaker', () => {
  const content = turnHighlightText(2, [segment()], turns)
  expect(content.text).toBe(segment().text)
  expect(textPieces(content, [], 2).filter(piece => piece.preview).map(piece => piece.text)).toEqual(['world!'])
})
test('overlapping different speakers with equal evidence stay neutral', () => {
  expect(highlightText([segment()], [{ start: 0, end: 3, speaker: 'A' }, { start: 0, end: 3, speaker: 'B' }]).ranges).toEqual([])
  expect(activeTurns(turns, 1)).toEqual([1])
  expect(activeTurns(turns, 3)).toEqual([])
  expect(activeTurns(turns, 1.8)).toEqual([1])
})
test('missing alignment and edited source text/times fall back to neutral', () => {
  for (const value of [{ ...segment(), alignment: undefined }, { ...segment(), text: 'Edited transcript' }, { ...segment(), start: 0.2 }]) {
    expect(alignedWords(value)).toEqual([])
    expect(highlightText([value], turns).ranges).toEqual([])
  }
})
test('invalid character or time ranges cannot survive validation', () => {
  for (const change of [{ from: -1 }, { to: 100 }, { start: NaN }, { end: 0 }, { end: 4 }]) {
    const value = segment()
    value.alignment = { ...value.alignment!, words: [{ ...value.alignment!.words[0]!, ...change }] }
    expect(alignedWords(value)).toEqual([])
  }
})
test('grouped passages preserve punctuation, neutral gaps and copying', () => {
  const first = segment(), second = { start: 3, end: 4, text: ' Again.', speaker: 'A' }
  const result = { segments: [first, second], turns, stages: {}, metadata: { runtime: 'test', models: [], backend: 'whisper' }, warnings: [] }
  expect(highlightText(result.segments, turns).text).toBe('Hello there world! Again.')
  expect(formatTranscript(result, true, { A: 'Reader' })).toBe('Reader: Hello there\nSpeaker 2: world!\nReader: Again.\n')
  expect(formatTranscript(result, false)).toBe('Hello there world! Again.\n')
})
test('worker validation preserves valid enrichment but drops stale optional alignment', () => {
  const value = { segments: [segment()], turns, stages: {}, metadata: { runtime: 'test', models: [], backend: 'whisper' }, warnings: [] }
  expect(parseWorkerResult(value).segments[0]?.alignment?.words).toHaveLength(3)
  value.segments[0]!.text = 'Changed'
  expect(parseWorkerResult(value).segments[0]?.alignment).toBeUndefined()
})
