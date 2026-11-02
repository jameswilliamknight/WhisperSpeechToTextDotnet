import { chmod, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { privateRoot } from '../paths'
import { runProcess } from '../process'
import { adapterConfiguration } from '../backends/registry'
import { parseWorkerResult } from '../backends/result'
import { readJson } from '../files'
import { assertUnchanged, fingerprint } from '../source/integrity'
import { job, saveJob, type JobRecord } from './store'
import { finalizeTranscript } from './finalize'

const fencePath = join(privateRoot, 'worker-group.json')

export async function executeJob(record: JobRecord, controller: AbortController): Promise<void> {
  const started = performance.now()
  const options = { cwd: record.directory, signal: controller.signal, fencePath }
  // Durable cancellation also works when another Nitro process receives the request.
  let poll: Promise<void> | undefined
  const cancellation = setInterval(() => {
    if (poll) return
    poll = job(record.detail.id).then(saved => { if (saved.cancelRequested) controller.abort() }).catch(() => controller.abort()).finally(() => { poll = undefined })
  }, 150)
  try {
    const probe = join(record.directory, 'probe.json')
    // ffprobe writes to stdout; -o keeps subprocess output out of the application response/log channel.
    await runProcess(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', '-o', probe, record.inputPath], { ...options, log: join(record.directory, 'probe.log') })
    await chmod(probe, 0o600)
    const duration = Number(JSON.parse(await readFile(probe, 'utf8')).format?.duration)
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Audio duration is invalid')
    record.detail.durationSeconds = duration
    await runProcess(['ffmpeg', '-nostdin', '-n', '-v', 'error', '-i', record.inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', record.audioPath], { ...options, log: join(record.directory, 'preparation.log') })
    await chmod(record.audioPath, 0o400)
    record.detail.audioAvailable = true
    record.detail.phase = 'Transcribing and identifying speakers'
    await saveJob(record)
    controller.signal.throwIfAborted()
    const adapter = await adapterConfiguration('whisper')
    if (!adapter) throw new Error('Whisper is not configured')
    const resultPath = join(record.directory, 'result.json')
    const progressPath = join(record.directory, 'progress.json')
    // A path may legitimately sit under a selected source folder; only file identity proves it is the original.
    const origin = record.original ? ['--origin', record.original.path] : []
    await runProcess([...adapter.command, '--input', record.audioPath, '--output', resultPath, '--progress', progressPath, ...origin], {
      ...options, cwd: adapter.cwd, log: join(record.directory, 'worker.log'), measure: true,
    })
    await chmod(resultPath, 0o600)
    const result = parseWorkerResult(await readJson(resultPath))
    if (!result.segments.length || !result.turns.length) throw new Error('Worker must return transcription and speaker turns')
    if ([...result.segments, ...result.turns].some(span => span.end > duration + 2)) throw new Error('Worker timestamps exceed audio duration')
    controller.signal.throwIfAborted()
    record.detail.result = result
    await finalizeTranscript(record, controller, started)
  }
  catch (error) {
    record.detail.status = controller.signal.aborted ? 'cancelled' : 'failed'
    record.detail.phase = controller.signal.aborted ? 'Cancelled' : 'Failed'
    record.detail.error = error instanceof Error ? error.message : 'Transcription failed'
  }
  finally {
    clearInterval(cancellation)
    if (poll) await poll
    // Verify on failure/cancellation too. A changed original must never be reported as an ordinary cancelled run.
    if (record.original && record.detail.status !== 'succeeded') {
      try { assertUnchanged(record.original.fingerprint, await fingerprint(record.original.path)) }
      catch { record.detail.status = 'failed'; record.detail.phase = 'Integrity check failed'; record.detail.error = 'Original audio changed; review source integrity before continuing' }
    }
    if (record.detail.status !== 'succeeded') {
      record.detail.finishedAt = new Date().toISOString()
      record.detail.wallSeconds = (performance.now() - started) / 1000
      await saveJob(record)
    }
  }
}
