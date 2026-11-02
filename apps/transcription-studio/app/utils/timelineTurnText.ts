import type { SpeakerTurn, TranscriptSegment } from '../../shared/studio'

/** Turns and transcript segments have independent boundaries; match overlapping
 * speech from this speaker, never a simultaneous turn belonging to someone else. */
export function timelineTurnText(turn: Readonly<SpeakerTurn>, segments: readonly Readonly<TranscriptSegment>[]): string {
  return segments
    .filter(segment => segment.start < turn.end && segment.end > turn.start && (!segment.speaker || segment.speaker === turn.speaker))
    .map(segment => segment.text.trim())
    .filter(Boolean)
    .join(' ')
}
