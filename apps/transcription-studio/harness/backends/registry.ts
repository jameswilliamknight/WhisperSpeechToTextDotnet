import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import type { BackendId, BackendInfo } from '../../shared/studio'
import { appsRoot, privateRoot } from '../paths'
import { readJson } from '../files'

interface AdapterConfig { command: string[]; cwd: string }
interface Adapters { fluidaudio?: AdapterConfig; nemo?: AdapterConfig; whisper?: AdapterConfig }

const definitions: Omit<BackendInfo, 'available'>[] = [
  { id: 'fluidaudio', name: 'FluidAudio', acceleration: 'Apple Neural Engine', description: 'Parakeet + offline speaker diarisation' },
  { id: 'nemo', name: 'NeMo Speech', acceleration: 'Apple Metal', description: 'Parakeet + Nemotron 3 Diarization' },
  { id: 'whisper', name: 'Whisper reference', acceleration: 'Apple Metal', description: 'whisper.cpp + separate diarisation; no .NET' },
]

/** Adapter argv is trusted local config, never accepted from the browser or interpolated by a shell. */
export async function adapterConfiguration(id: BackendId): Promise<AdapterConfig | undefined> {
  let configured: Adapters = {}
  try { configured = await readJson<Adapters>(resolve(privateRoot, 'adapters.json')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const custom = configured[id]
  if (custom) {
    if (!Array.isArray(custom.command) || custom.command.length === 0 || custom.command.some(arg => typeof arg !== 'string') || !custom.cwd?.startsWith('/')) {
      throw new Error('Invalid local adapter configuration')
    }
    return custom
  }
  if (id === 'fluidaudio') return {
    command: [resolve(appsRoot, 'fluidaudio-experiment/.build/out/Products/Release/worker'), '--offline'],
    cwd: resolve(appsRoot, 'fluidaudio-experiment'),
  }
  return undefined
}

export async function backendList(): Promise<BackendInfo[]> {
  return Promise.all(definitions.map(async definition => {
    const config = await adapterConfiguration(definition.id)
    let available = false
    if (process.platform === 'darwin' && process.arch === 'arm64' && config) {
      try { await access(config.command[0]!, constants.X_OK); available = true } catch { /* Display setup state. */ }
    }
    return {
      ...definition, available,
      reason: available ? undefined : 'Worker not configured/built on this Apple Silicon Mac. See experiment README.',
    }
  }))
}
