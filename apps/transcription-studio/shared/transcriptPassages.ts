import type { SpeakerTurn, TranscriptSegment } from './studio'
import { speakerSegments } from './speakerSegments'
import { processingOptions } from './transcriptProcessing'
import type { TranscriptProcessing } from './transcriptProcessing'

export function joinText(left: string, right: string): string {
  const word = right.trim()
  if (!word) return left
  if (!left) return word
  const noSpace = ',.;:!?%)]}’'.includes(word[0]!) || /^'(?:s|t|re|ve|ll|d|m)\b/.test(word) || '([{'.includes(left.at(-1)!)
  return `${left}${noSpace ? '' : ' '}${word}`
}

export interface TranscriptPassage extends TranscriptSegment {
  sources: readonly Readonly<TranscriptSegment>[]
}

/** Presentation only: retain native source records for alignment and unchanged exports. */
export function transcriptPassages(segments: readonly Readonly<TranscriptSegment>[], pauseSeconds = 1.5, turns: readonly Readonly<SpeakerTurn>[] = [], input?: Partial<TranscriptProcessing>): TranscriptPassage[] {
  const options = processingOptions(input)
  const passages: TranscriptPassage[] = []
  for (const segment of speakerSegments(segments, turns, options)) {
    const previous = passages.at(-1)
    if (options.groupSameSpeaker && previous && previous.speaker === segment.speaker && segment.start >= previous.start && segment.start - previous.end <= pauseSeconds) {
      previous.end = Math.max(previous.end, segment.end)
      previous.text = joinText(previous.text, segment.text)
      previous.sources = [...previous.sources, segment]
      // A grouped passage has different text/times; only source segments own alignment.
      delete previous.alignment
    }
    else passages.push({ ...segment, text: segment.text.trim(), sources: [segment] })
  }
  return passages
}
