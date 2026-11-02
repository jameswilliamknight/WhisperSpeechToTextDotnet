import type { WorkerResult } from './studio'

export const speakerNameLimit = 60

type SpeakerSource = {
  readonly segments: readonly Readonly<WorkerResult['segments'][number]>[]
  readonly turns: readonly Readonly<WorkerResult['turns'][number]>[]
}

/** Turn order first, then segment-only ids: the same stable order used across the UI and exports. */
export function speakerIds(result: SpeakerSource): string[] {
  return [...new Set([
    ...result.turns.map(turn => turn.speaker),
    ...result.segments.flatMap(segment => segment.speaker ? [segment.speaker] : []),
  ])]
}

export function speakerLabels(speakers: readonly string[], overrides: Readonly<Record<string, string>> = {}): Map<string, string> {
  return new Map(speakers.map((speaker, index) => [speaker, overrides[speaker]?.trim() || `Speaker ${index + 1}`]))
}

export function workerSpeakerLabels(result: SpeakerSource, overrides: Readonly<Record<string, string>> = {}): Map<string, string> {
  return speakerLabels(speakerIds(result), overrides)
}

/** Renames are display annotations; raw speaker ids and benchmark data stay untouched. */
export function normaliseSpeakerNames(result: SpeakerSource, input: Readonly<Record<string, string>>): Record<string, string> {
  const known = new Set(speakerIds(result))
  const names: Record<string, string> = {}
  for (const [speaker, raw] of Object.entries(input)) {
    if (!known.has(speaker)) throw new Error('Unknown speaker identifier')
    const name = raw.trim()
    if (!name) continue
    if (name.length > speakerNameLimit) throw new Error(`Speaker names must be ${speakerNameLimit} characters or fewer`)
    if ([...name].some(character => character.codePointAt(0)! < 0x20 || character.codePointAt(0) === 0x7F)) {
      throw new Error('Speaker names must not contain control characters')
    }
    names[speaker] = name
  }
  return names
}
