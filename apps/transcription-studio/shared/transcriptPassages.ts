import type { TranscriptSegment } from './studio'

function joinText(left: string, right: string): string {
  const word = right.trim()
  if (!word) return left
  if (!left) return word
  const noSpace = ',.;:!?%)]}’'.includes(word[0]!) || /^'(?:s|t|re|ve|ll|d|m)\b/.test(word) || '([{'.includes(left.at(-1)!)
  return `${left}${noSpace ? '' : ' '}${word}`
}

/** Presentation only: retain native word records and raw diarisation turns for benchmarking/export. */
export function transcriptPassages(segments: readonly Readonly<TranscriptSegment>[], pauseSeconds = 1.5): TranscriptSegment[] {
  const passages: TranscriptSegment[] = []
  for (const segment of segments) {
    const previous = passages.at(-1)
    if (previous && previous.speaker === segment.speaker && segment.start >= previous.start && segment.start - previous.end <= pauseSeconds) {
      previous.end = Math.max(previous.end, segment.end)
      previous.text = joinText(previous.text, segment.text)
    }
    else passages.push({ ...segment, text: segment.text.trim() })
  }
  return passages
}
