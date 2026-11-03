import { computed } from 'vue'
import type { SpeakerTurn } from '#shared/studio'
import { activeTurns } from '../utils/transcriptHighlight'

/** The media clock ticks every frame; text only needs updating at turn boundaries. */
export function useActiveTurns(turns: () => readonly Readonly<SpeakerTurn>[], position: () => number) {
  return computed<readonly number[]>((previous) => {
    const next = activeTurns(turns(), position())
    return previous && next.length === previous.length && next.every((value, index) => value === previous[index]) ? previous : next
  })
}
