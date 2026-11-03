import type { RunStatus, WorkerResult } from './studio'
import type { TranscriptProcessingToggles } from './transcriptProcessing'

export interface LocationSettings {
  sourceDirectory: string
  workingDirectory: string
  outputDirectory: string
}

export interface WorkspacePreferences {
  selectedJobId: string | null
  copyWithSpeakers: boolean
  transcriptProcessing?: TranscriptProcessingToggles
}

export interface JobProgress {
  stage: string
  /** Null while a native stage cannot report meaningful percentage. */
  percent: number | null
  updatedAt: string
}

export interface TranscriptionJob {
  id: string
  name: string
  status: RunStatus
  phase: string
  startedAt: string
  finishedAt?: string
  durationSeconds?: number
  wallSeconds?: number
  error?: string
  outputPath?: string
  progress?: JobProgress
  /** Opaque file identity; filenames alone must never merge different locations. */
  recordingId?: string
  hasTranscript?: boolean
  retryAvailable?: boolean
  retryUnavailableReason?: string
}

export interface TranscriptionDetail extends TranscriptionJob {
  result?: WorkerResult
  /** Presentation-only overrides for opaque backend speaker ids. */
  speakerNames?: Record<string, string>
  audioAvailable: boolean
}

export interface WorkspaceSnapshot {
  settings: LocationSettings
  preferences: WorkspacePreferences
  jobs: TranscriptionJob[]
  activeJobId: string | null
  engine: { available: boolean; reason?: string }
}

export interface SourceFile {
  recordingId?: string
  name: string
  bytes: number
  modifiedAt: string
}
