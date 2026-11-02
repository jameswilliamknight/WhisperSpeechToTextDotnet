import type { WorkerResult } from './studio'
import { transcriptPassages } from './transcriptPassages'
import { workerSpeakerLabels } from './speakerNames'

/** One formatter is used for exported files and clipboard content to avoid divergent speaker labelling. */
export function formatTranscript(result: WorkerResult, withSpeakers: boolean, speakerNames: Readonly<Record<string, string>> = {}): string {
  const labels = workerSpeakerLabels(result, speakerNames)
  return transcriptPassages(result.segments).map(segment => {
    const label = segment.speaker ? labels.get(segment.speaker) ?? segment.speaker : 'Unlabelled'
    return withSpeakers ? `${label}: ${segment.text.trim()}` : segment.text.trim()
  }).filter(Boolean).join('\n') + '\n'
}
