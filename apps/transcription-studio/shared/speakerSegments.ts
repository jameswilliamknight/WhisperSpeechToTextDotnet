import type { SpeakerTurn, TranscriptSegment } from './studio'
import { alignedWords } from './wordAlignment'
import { condensedOwners, retainSpeakerOwners } from './speakerCondensing'
import type { TranscriptProcessing } from './transcriptProcessing'

/** Read-only presentation/copy projection: native segments and their alignment
 * remain untouched. Split only on real timed-word boundaries, using exactly the
 * same conservative contextual ownership as highlighting. No alignment means
 * no guessed word timings; short same-speaker gaps need not create new rows.
 * This exposes the diariser's assignment, not a claim that it is infallible. */
export function speakerSegments(segments: readonly Readonly<TranscriptSegment>[], turns: readonly Readonly<SpeakerTurn>[], options?: Partial<TranscriptProcessing>): readonly Readonly<TranscriptSegment>[] {
  const owners = condensedOwners(segments, turns, options)
  return segments.flatMap((segment, segmentIndex) => {
    const words = alignedWords(segment)
    if (!words.length || !turns.length) return [segment]
    const speakers = owners[segmentIndex]!.map(owner => turns[owner]?.speaker)
    const boundaries = [0]
    for (let index = 1; index < words.length; index++) {
      if (speakers[index] !== speakers[index - 1]) boundaries.push(index)
    }
    boundaries.push(words.length)
    return boundaries.slice(0, -1).map((first, index) => {
      const last = boundaries[index + 1]!
      const from = first === 0 ? 0 : words[first]!.from
      const to = last === words.length ? segment.text.length : words[last]!.from
      const raw = segment.text.slice(from, to)
      const offset = from + raw.length - raw.trimStart().length
      const source = {
        text: raw.trim(),
        start: first === 0 ? segment.start : words[first]!.start,
        end: last === words.length ? segment.end : words[last - 1]!.end,
      }
      const projected = {
        ...source, speaker: speakers[first],
        alignment: { version: 1 as const, source: { ...source }, words: words.slice(first, last).map(word => ({ ...word, from: word.from - offset, to: word.to - offset })) },
      }
      retainSpeakerOwners(projected, turns, owners[segmentIndex]!.slice(first, last), options)
      return projected
    })
  })
}
