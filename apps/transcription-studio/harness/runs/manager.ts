import { resolve } from 'node:path'
import { access } from 'node:fs/promises'
import { cpus, release as osRelease, totalmem } from 'node:os'
import type { BackendId, BenchmarkRun, RunPreset, StudioSnapshot } from '../../shared/studio'
import { normaliseSpeakerNames } from '../../shared/speakerNames'
import { readJson, writeJson } from '../files'
import { privateRoot } from '../paths'
import { adapterConfiguration, backendList } from '../backends/registry'
import { parseWorkerResult } from '../backends/result'
import { runProcess } from '../process'
import { prepareAudio } from '../source/audio'
import { sourceInfo, verifySource } from '../source/source'
import { acquireRunLock, listRuns, recoverInterruptedRuns, runDirectory, saveRun } from './store'

interface ActiveRun { run: BenchmarkRun; controller: AbortController; done: Promise<void> }
const stateKey = Symbol.for('transcription-studio.runner')
const state = globalThis as typeof globalThis & { [stateKey]?: { active?: ActiveRun } }
const runner = state[stateKey] ??= {}

async function execute(run: BenchmarkRun, controller: AbortController): Promise<void> {
  const directory = runDirectory(run.id)
  // CLI and browser share a serial filesystem runner; cancellation must also cross processes.
  const cancellation = setInterval(() => {
    void access(resolve(directory, 'cancel.json')).then(() => controller.abort()).catch(() => {})
  }, 250)
  try {
    const audio = await prepareAudio(directory, run.preset, controller.signal)
    Object.assign(run, {
      preparationSeconds: audio.preparationSeconds, durationSeconds: audio.durationSeconds,
      sourceSha256: audio.sourceSha256, phase: 'Transcribing and diarising locally',
    })
    await saveRun(run)
    controller.signal.throwIfAborted()
    const adapter = await adapterConfiguration(run.backend)
    if (!adapter) throw new Error('Backend is not configured')
    const output = resolve(directory, 'result.json')
    const timing = await runProcess([...adapter.command, '--input', audio.path, '--output', output], {
      cwd: adapter.cwd, log: resolve(directory, 'worker.log'), measure: true, signal: controller.signal,
      fencePath: resolve(privateRoot, 'worker-group.json'),
    })
    const result = parseWorkerResult(await readJson(output))
    if (!result.segments.length || !result.turns.length) throw new Error('Worker did not return both transcription and diarisation')
    if (result.segments.some(segment => segment.end > audio.durationSeconds + 2) || result.turns.some(turn => turn.end > audio.durationSeconds + 2)) {
      throw new Error('Worker timestamps exceed the input duration')
    }
    Object.assign(run, {
      result, ...timing, realTimeFactor: audio.durationSeconds / timing.wallSeconds,
      status: 'succeeded', phase: 'Complete',
    })
  }
  catch (error) {
    run.status = controller.signal.aborted ? 'cancelled' : 'failed'
    run.phase = controller.signal.aborted ? 'Cancelled' : 'Failed'
    run.error = error instanceof Error ? error.message : 'Unknown worker failure'
  }
  finally {
    clearInterval(cancellation)
    try { await verifySource(); run.integrityVerified = true }
    catch { run.integrityVerified = false; run.status = 'failed'; run.phase = 'Integrity verification failed'; run.error = 'Source integrity verification failed; processing is blocked pending review' }
    run.finishedAt = new Date().toISOString()
    await saveRun(run)
  }
}

export async function startRun(backend: BackendId, preset: RunPreset): Promise<BenchmarkRun> {
  if (runner.active) throw new Error('A benchmark is already running')
  const selected = (await backendList()).find(candidate => candidate.id === backend)
  if (!selected?.available) throw new Error(selected?.reason ?? 'Unknown backend')
  const release = await acquireRunLock()
  const run: BenchmarkRun = {
    id: crypto.randomUUID(), backend, preset, status: 'running',
    phase: 'Verifying source and preparing working audio', startedAt: new Date().toISOString(),
    environment: {
      platform: process.platform, architecture: process.arch, hardware: cpus()[0]?.model ?? 'Unknown',
      os: osRelease(), memoryBytes: totalmem(), bun: Bun.version,
    },
  }
  const controller = new AbortController()
  try { await saveRun(run) }
  catch (error) { await release(); throw error }
  const active: ActiveRun = { run, controller, done: Promise.resolve() }
  runner.active = active
  active.done = execute(run, controller).finally(async () => {
    try { await release() }
    catch (error) {
      run.status = 'failed'; run.phase = 'Finalisation failed'
      run.error = 'Runner ownership could not be safely released; inspect private diagnostics before starting another run'
      await saveRun(run)
      throw error
    }
    finally { runner.active = undefined }
  })
  // The request returns immediately; the durable record carries failures, not an unhandled rejection.
  void active.done.catch(error => console.error('Benchmark finalisation failed:', error instanceof Error ? error.name : 'unknown'))
  return { ...run }
}

export async function waitForRun(id: string): Promise<BenchmarkRun | undefined> {
  if (runner.active?.run.id === id) await runner.active.done
  return (await listRuns()).find(run => run.id === id)
}

export async function cancelRun(id: string): Promise<void> {
  if (runner.active?.run.id === id) { runner.active.controller.abort(); return }
  const run = (await listRuns()).find(candidate => candidate.id === id)
  if (run?.status !== 'running') throw new Error('Run is not active')
  await writeJson(resolve(runDirectory(id), 'cancel.json'), { requestedAt: new Date().toISOString() })
}

export async function updateRunSpeakerNames(id: string, input: Record<string, string>): Promise<Record<string, string>> {
  const path = resolve(runDirectory(id), 'run.json')
  const run = await readJson<BenchmarkRun>(path)
  if (!run.result) throw new Error('Run transcript is not available')
  run.speakerNames = normaliseSpeakerNames(run.result, input)
  await saveRun(run)
  return run.speakerNames
}

export async function studioSnapshot(): Promise<StudioSnapshot> {
  if (!runner.active) await recoverInterruptedRuns()
  const runs = await listRuns()
  return { source: await sourceInfo(), backends: await backendList(), runs, activeRunId: runner.active?.run.id ?? runs.find(run => run.status === 'running')?.id ?? null }
}
