import { constants } from 'node:fs'
import { chmod, copyFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SourceInfo } from '../../shared/studio'
import { privateDirectory, privateRoot } from '../paths'
import { readJson, sha256, writeJson } from '../files'
import { assertUnchanged, fingerprint, type Fingerprint } from './integrity'

interface LocalConfig { sourcePath: string }
interface SourceManifest { original: Fingerprint; durationSeconds: number; verifiedAt: string }

const configPath = resolve(privateRoot, 'config.json')
export const copiedSource = resolve(privateRoot, 'recordings', 'source.mp3')
const manifestPath = resolve(privateRoot, 'source.json')

async function configuration(): Promise<LocalConfig> {
  const config = await readJson<LocalConfig>(configPath)
  if (typeof config.sourcePath !== 'string' || !config.sourcePath.startsWith('/')) throw new Error('Invalid local source configuration')
  if (config.sourcePath.startsWith(`${privateRoot}/`)) throw new Error('Original must be outside Studio private state')
  return config
}

/** The only original-file operations in the harness are read-only stat/hash and copyFile's source read. */
export async function prepareSource(): Promise<SourceInfo> {
  const config = await configuration()
  await privateDirectory(resolve(privateRoot, 'recordings'))
  let manifest: SourceManifest | undefined
  try { manifest = await readJson<SourceManifest>(manifestPath) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const before = await fingerprint(config.sourcePath)
  if (manifest) {
    assertUnchanged(manifest.original, before)
    if ((await lstat(copiedSource)).isSymbolicLink() || await sha256(copiedSource) !== before.sha256) {
      throw new Error('Working source copy failed integrity verification')
    }
    await verifySource()
    return sourceInfo()
  }
  // Never overwrite even an orphaned copy: it requires explicit local recovery/review.
  await copyFile(config.sourcePath, copiedSource, constants.COPYFILE_EXCL)
  await chmod(copiedSource, 0o400)
  if (await sha256(copiedSource) !== before.sha256) throw new Error('Copy checksum mismatch')
  assertUnchanged(before, await fingerprint(config.sourcePath))
  const probe = Bun.spawn(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', copiedSource], {
    stdout: 'pipe', stderr: 'ignore',
  })
  const result = JSON.parse(await new Response(probe.stdout).text())
  if (await probe.exited !== 0) throw new Error('Cannot inspect working audio copy')
  const durationSeconds = Number(result.format?.duration)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Invalid source audio duration')
  await writeJson(manifestPath, { original: before, durationSeconds, verifiedAt: new Date().toISOString() })
  return sourceInfo()
}

export async function verifySource(): Promise<void> {
  const config = await configuration()
  const manifest = await readJson<SourceManifest>(manifestPath)
  assertUnchanged(manifest.original, await fingerprint(config.sourcePath))
  if (await sha256(copiedSource) !== manifest.original.sha256) throw new Error('Working source copy has changed')
  await writeJson(manifestPath, { ...manifest, verifiedAt: new Date().toISOString() })
}

export async function sourceInfo(): Promise<SourceInfo> {
  try {
    const manifest = await readJson<SourceManifest>(manifestPath)
    return {
      prepared: true, label: 'Private local recording', durationSeconds: manifest.durationSeconds,
      bytes: manifest.original.bytes, sha256: manifest.original.sha256, verifiedAt: manifest.verifiedAt,
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { prepared: false, label: 'Private local recording' }
  }
}
