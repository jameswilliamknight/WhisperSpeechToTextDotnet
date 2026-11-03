export type BackendId = 'fluidaudio' | 'nemo' | 'whisper'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
export type RunPreset = 'smoke' | 'full'

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker?: string
  alignment?: WordAlignment
}

export interface TimedWord {
  from: number
  to: number
  start: number
  end: number
}

/** Exact source snapshot prevents stale character ranges surviving transcript edits. */
export interface WordAlignment {
  version: 1
  source: Readonly<{ text: string; start: number; end: number }>
  words: readonly Readonly<TimedWord>[]
}

export interface SpeakerTurn {
  start: number
  end: number
  speaker: string
}

export interface WorkerResult {
  segments: TranscriptSegment[]
  turns: SpeakerTurn[]
  stages: Record<string, number>
  metadata: { runtime: string; models: string[]; backend: string }
  warnings: string[]
}

export interface BenchmarkRun {
  id: string
  backend: BackendId
  preset: RunPreset
  status: RunStatus
  phase: string
  startedAt: string
  finishedAt?: string
  durationSeconds?: number
  wallSeconds?: number
  preparationSeconds?: number
  /** Audio seconds / processing seconds (RTFx); higher is faster. */
  realTimeFactor?: number
  peakMemoryBytes?: number
  integrityVerified?: boolean
  sourceSha256?: string
  environment?: { platform: string; architecture: string; hardware: string; os: string; memoryBytes: number; bun: string }
  error?: string
  result?: WorkerResult
  /** Presentation-only overrides for opaque backend speaker ids. */
  speakerNames?: Record<string, string>
}

export interface BackendInfo {
  id: BackendId
  name: string
  acceleration: string
  description: string
  available: boolean
  reason?: string
}

export interface SourceInfo {
  prepared: boolean
  label: string
  durationSeconds?: number
  bytes?: number
  sha256?: string
  verifiedAt?: string
}

export interface StudioSnapshot {
  source: SourceInfo
  backends: BackendInfo[]
  runs: BenchmarkRun[]
  activeRunId: string | null
}
