/** UI/storage switches are opt-outs from the recommended conservative baseline.
 * All-false is intentional; runtime algorithms consume positive options below. */
export interface TranscriptProcessingToggles {
  disableGrouping: boolean
  disableGapBridging: boolean
  disableUnlabelledCondensing: boolean
  disableIslandCorrection: boolean
  disablePlainCopyFlow: boolean
}

export const processingToggleDefaults: Readonly<TranscriptProcessingToggles> = Object.freeze({
  disableGrouping: false, disableGapBridging: false, disableUnlabelledCondensing: false,
  disableIslandCorrection: false, disablePlainCopyFlow: false,
})

export function normaliseProcessingToggles(input?: Partial<TranscriptProcessingToggles>): TranscriptProcessingToggles {
  return Object.fromEntries(Object.keys(processingToggleDefaults).map(key => [
    key, input?.[key as keyof TranscriptProcessingToggles] === true,
  ])) as unknown as TranscriptProcessingToggles
}

export function processingFromToggles(input?: Partial<TranscriptProcessingToggles>): TranscriptProcessing {
  const toggles = normaliseProcessingToggles(input)
  return {
    groupSameSpeaker: !toggles.disableGrouping, bridgeShortGaps: !toggles.disableGapBridging,
    condenseUnlabelled: !toggles.disableUnlabelledCondensing, smoothSpeakerIslands: !toggles.disableIslandCorrection,
    plainCopyFlow: !toggles.disablePlainCopyFlow,
  }
}

/** Read-only presentation options. Native words/results are never rewritten. */
export interface TranscriptProcessing {
  groupSameSpeaker: boolean
  bridgeShortGaps: boolean
  condenseUnlabelled: boolean
  smoothSpeakerIslands: boolean
  plainCopyFlow: boolean
}

export const processingDefaults: Readonly<TranscriptProcessing> = Object.freeze({
  groupSameSpeaker: true, bridgeShortGaps: true, condenseUnlabelled: true,
  smoothSpeakerIslands: true, plainCopyFlow: true,
})

/** Older SQLite rows and clients may omit newer flags. Never coerce strings. */
export function processingOptions(input?: Partial<TranscriptProcessing>): TranscriptProcessing {
  return Object.fromEntries(Object.entries(processingDefaults).map(([key, fallback]) => [
    key, typeof input?.[key as keyof TranscriptProcessing] === 'boolean' ? input[key as keyof TranscriptProcessing] : fallback,
  ])) as unknown as TranscriptProcessing
}
