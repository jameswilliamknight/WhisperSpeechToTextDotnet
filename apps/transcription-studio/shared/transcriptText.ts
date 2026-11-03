import type { WorkerResult } from './studio'
import { transcriptPassages } from './transcriptPassages'
import { workerSpeakerLabels } from './speakerNames'
import { processingOptions } from './transcriptProcessing'
import type { TranscriptProcessing } from './transcriptProcessing'

/** One formatter is used for exported files and clipboard content to avoid divergent speaker labelling. */
export function formatTranscript(result: WorkerResult, withSpeakers: boolean, speakerNames: Readonly<Record<string, string>> = {}, input?: Partial<TranscriptProcessing>): string {
  const options = processingOptions(input)
  const labels = workerSpeakerLabels(result, speakerNames)
  // Plain copying retains sentence-level flow rather than inserting line breaks
  // at every diarisation change when there are no labels to explain them.
  return transcriptPassages(result.segments, 1.5, withSpeakers || !options.plainCopyFlow ? result.turns : [], options).map(segment => {
    const label = segment.speaker ? labels.get(segment.speaker) ?? segment.speaker : 'Unlabelled'
    return withSpeakers ? `${label}: ${segment.text.trim()}` : segment.text.trim()
  }).filter(Boolean).join('\n') + '\n'
}
