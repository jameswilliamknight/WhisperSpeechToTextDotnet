import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import { appsRoot, privateDirectory, privateRoot } from '../harness/paths'
import { writeJson } from '../harness/files'

const nemo = resolve(appsRoot, 'nemo-experiment')
const nemoBinary = resolve(nemo, '.runtime/nemo-speech-0.3.0-macos-aarch64-metal/bin/nemo-speech')
const diariser = resolve(nemo, 'models/nvidia/Nemotron-3-Diarization/f667ed73aee57d40cc39428eb768b4fd87a0a29e/Nemotron-3-Diarization.q8_0.gguf')
const adapters: Record<string, { command: string[]; cwd: string }> = {}

async function exists(path: string, executable = false) {
  try { await access(path, executable ? constants.X_OK : constants.R_OK); return true } catch { return false }
}

const fluidBinary = resolve(appsRoot, 'fluidaudio-experiment/.build/out/Products/Release/worker')
if (await exists(fluidBinary, true)) adapters.fluidaudio = {
  command: [fluidBinary, '--offline'], cwd: resolve(appsRoot, 'fluidaudio-experiment'),
}
if (await exists(nemoBinary, true) && await exists(diariser)) {
  adapters.nemo = { command: [process.execPath, resolve(nemo, 'worker.ts')], cwd: nemo }
  const whisper = resolve(appsRoot, 'whisper-experiment')
  if (await exists(resolve(whisper, '.runtime/whisper.cpp/build/bin/whisper-cli'), true)) adapters.whisper = {
    command: [
      '/usr/bin/env', `NEMO_SPEECH_BIN=${nemoBinary}`, `NEMO_DIAR_MODEL=${diariser}`,
      process.execPath, resolve(whisper, 'worker.ts'),
    ],
    cwd: whisper,
  }
}
await privateDirectory(privateRoot)
await writeJson(resolve(privateRoot, 'adapters.json'), adapters)
console.log(`Configured installed adapters: ${Object.keys(adapters).join(', ') || 'none'}. No models downloaded.`)
