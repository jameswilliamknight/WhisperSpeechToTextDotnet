import type { TimedWord, TranscriptSegment } from './studio'

/** Optional enrichment must never make older or edited transcripts unreadable.
 * Reject the whole alignment on corruption instead of colouring incorrect words. */
export function alignedWords(segment: Readonly<TranscriptSegment>): readonly Readonly<TimedWord>[] {
  const alignment = segment.alignment
  if (!alignment || alignment.version !== 1 || !alignment.source || !Array.isArray(alignment.words)) return []
  if (alignment.source.text !== segment.text || alignment.source.start !== segment.start || alignment.source.end !== segment.end) return []
  let character = 0, time = segment.start
  for (const word of alignment.words) {
    if (!word || !Number.isInteger(word.from) || !Number.isInteger(word.to) || word.from < character || word.to <= word.from || word.to > segment.text.length
      || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < time || word.end <= word.start || word.end > segment.end
      || !segment.text.slice(word.from, word.to).trim()) return []
    character = word.to
    time = word.end
  }
  return alignment.words
}
