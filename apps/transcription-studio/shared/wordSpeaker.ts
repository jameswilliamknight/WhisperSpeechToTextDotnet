import type { SpeakerTurn } from './studio'

/** One owner per word, shared by labels, copying and highlights. Equal
 * cross-speaker evidence stays unlabelled; continuity cannot override it. */
export function wordOwner(start: number, end: number, turns: readonly Readonly<SpeakerTurn>[], bridgeShortGaps = true): number {
  let best = 0, owner = -1, ambiguous = false
  turns.forEach((turn, index) => {
    const overlap = Math.min(end, turn.end) - Math.max(start, turn.start)
    if (overlap > best + 1e-9) { best = overlap; owner = index; ambiguous = false }
    else if (overlap > 0 && Math.abs(overlap - best) < 1e-9 && turns[owner]?.speaker !== turn.speaker) ambiguous = true
  })
  if (ambiguous) return -1
  if (owner >= 0) return owner
  return bridgeShortGaps ? continuityOwner(start, end, turns) : -1
}

/** Only bridge wholly uncovered words inside a short diarisation gap bounded
 * by the same speaker. This is a presentation inference, not new diarisation
 * or invented timing. Never extrapolate at recording edges or across silence
 * longer than the passage pause limit. Boundary ties must also agree so input
 * ordering cannot silently hide a competing speaker. */
function continuityOwner(start: number, end: number, turns: readonly Readonly<SpeakerTurn>[]): number {
  let left = -1, right = -1
  turns.forEach((turn, index) => {
    if (turn.end <= start && (left < 0 || turn.end > turns[left]!.end)) left = index
    if (turn.start >= end && (right < 0 || turn.start < turns[right]!.start)) right = index
  })
  if (left < 0 || right < 0) return -1
  const before = turns[left]!, after = turns[right]!
  if (before.speaker !== after.speaker || after.start - before.end > 1.5) return -1
  if (turns.some(turn => turn.speaker !== before.speaker
    && (Math.abs(turn.end - before.end) < 1e-9 || Math.abs(turn.start - after.start) < 1e-9))) return -1
  // Use the nearer existing turn for phrase/tooltip ownership. The original
  // turns and playback activation remain unchanged, including the silent gap.
  return start - before.end < after.start - end ? left : right
}
