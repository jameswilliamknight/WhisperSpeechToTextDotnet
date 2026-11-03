import type { SpeakerTurn, TranscriptSegment } from '#shared/studio'
import { alignedWords } from '#shared/wordAlignment'
import { joinText } from '#shared/transcriptPassages'
import { condensedOwners } from '#shared/speakerCondensing'
import type { TranscriptProcessing } from '#shared/transcriptProcessing'

export interface PhraseRange {
  from: number
  to: number
  turn: number
}
export interface HighlightText {
  text: string
  ranges: PhraseRange[]
}

/** Precomputed on transcript/turn changes, not on every animation frame. Word
 * boundaries stay exact; consecutive words owned by one turn read as a phrase. */
export function highlightText(segments: readonly Readonly<TranscriptSegment>[], turns: readonly Readonly<SpeakerTurn>[], options?: Partial<TranscriptProcessing>): HighlightText {
  return ownedHighlightText(segments, condensedOwners(segments, turns, options))
}

function ownedHighlightText(segments: readonly Readonly<TranscriptSegment>[], owners: readonly (readonly number[])[]): HighlightText {
  let text = ''
  const ranges: PhraseRange[] = []
  for (const [segmentIndex, segment] of segments.entries()) {
    const next = joinText(text, segment.text)
    const trimmed = segment.text.trim()
    const offset = next.length - trimmed.length - (segment.text.length - segment.text.trimStart().length)
    text = next
    for (const [wordIndex, word] of alignedWords(segment).entries()) {
      const turn = owners[segmentIndex]![wordIndex]!
      if (turn < 0) continue
      const from = offset + word.from, to = offset + word.to
      const previous = ranges.at(-1)
      if (previous?.turn === turn && !text.slice(previous.to, from).trim()) previous.to = to
      else ranges.push({ from, to, turn })
    }
  }
  return { text, ranges }
}

export function activeTurns(turns: readonly Readonly<SpeakerTurn>[], position: number): number[] {
  return turns.flatMap((turn, index) => turn.start <= position && position < turn.end ? [index] : [])
}

export function turnHighlightText(index: number, segments: readonly Readonly<TranscriptSegment>[], turns: readonly Readonly<SpeakerTurn>[], options?: Partial<TranscriptProcessing>): HighlightText {
  const turn = turns[index]
  if (!turn) return { text: '', ranges: [] }
  // Resolve with the full transcript before selecting tooltip context. Filtering
  // first would remove neighbours and undo corrections visible in passage rows.
  const owners = condensedOwners(segments, turns, options)
  const selected = segments.flatMap((segment, segmentIndex) => {
    if (segment.start >= turn.end || segment.end <= turn.start) return []
    return !segment.speaker || segment.speaker === turn.speaker || owners[segmentIndex]!.includes(index) ? [segmentIndex] : []
  })
  return ownedHighlightText(selected.map(value => segments[value]!), selected.map(value => owners[value]!))
}

export function textPieces(content: HighlightText, active: readonly number[], preview?: number) {
  const selected = content.ranges.filter(range => active.includes(range.turn) || range.turn === preview)
  const pieces: { text: string; turn?: number; playback: boolean; preview: boolean }[] = []
  let cursor = 0
  for (const range of selected) {
    if (range.from > cursor) pieces.push({ text: content.text.slice(cursor, range.from), playback: false, preview: false })
    pieces.push({ text: content.text.slice(range.from, range.to), turn: range.turn, playback: active.includes(range.turn), preview: range.turn === preview })
    cursor = range.to
  }
  if (cursor < content.text.length) pieces.push({ text: content.text.slice(cursor), playback: false, preview: false })
  return pieces
}
