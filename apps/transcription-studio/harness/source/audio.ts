import { chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RunPreset } from '../../shared/studio'
import { copiedSource, prepareSource } from './source'
import { runProcess } from '../process'
import { privateRoot } from '../paths'

export async function prepareAudio(directory: string, preset: RunPreset, signal: AbortSignal) {
  const source = await prepareSource()
  const path = resolve(directory, 'input.wav')
  const durationSeconds = preset === 'smoke' ? Math.min(source.durationSeconds!, 90) : source.durationSeconds!
  const command = ['ffmpeg', '-nostdin', '-n', '-v', 'error', '-i', copiedSource]
  if (preset === 'smoke') command.push('-t', '90')
  command.push('-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', path)
  const timing = await runProcess(command, {
    cwd: directory, log: resolve(directory, 'preparation.log'), signal,
    fencePath: resolve(privateRoot, 'worker-group.json'),
  })
  await chmod(path, 0o400)
  return { path, durationSeconds, sourceSha256: source.sha256!, preparationSeconds: timing.wallSeconds }
}
