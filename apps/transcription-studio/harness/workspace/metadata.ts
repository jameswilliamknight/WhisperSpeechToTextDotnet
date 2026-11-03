import { constants, closeSync, fsyncSync, fstatSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, parse } from 'node:path'
import { normaliseSpeakerNames } from '../../shared/speakerNames'
import { formatTranscript } from '../../shared/transcriptText'
import type { JobRecord } from './store'

/** Called inside the workspace immediate transaction: processes share one writer order. */
function guarded(path: string): void {
  if (!isAbsolute(path) || normalize(path) !== path) throw new Error('Invalid output path')
  let current = parse(path).root
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, part)
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Output paths must not contain symlinks') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

export function metadataPath(record: JobRecord): string {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(record.detail.id)) throw new Error('Invalid transcription identifier')
  return join(record.settings.outputDirectory, `${record.detail.id}.metadata.json`)
}

function read(path: string): string | undefined {
  guarded(path)
  let fd: number
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Output must be a regular file')
    return readFileSync(fd, 'utf8')
  }
  finally { closeSync(fd) }
}

function removeTemporary(path: string): void {
  try { unlinkSync(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

function syncExisting(path: string): void {
  guarded(path)
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { fsyncSync(fd) } finally { closeSync(fd) }
  const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_NOFOLLOW)
  try { fsyncSync(directory) } finally { closeSync(directory) }
}

/** Sync the replacement and directory before SQLite may forget legacy names. */
function replace(path: string, contents: string): void {
  guarded(path)
  try { if (!lstatSync(path).isFile()) throw new Error('Output must be a regular file') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeFileSync(fd, contents)
    fsyncSync(fd)
    guarded(path)
    renameSync(temporary, path)
    const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_NOFOLLOW)
    try { fsyncSync(directory) } finally { closeSync(directory) }
  }
  finally {
    closeSync(fd)
    removeTemporary(temporary)
  }
}

export function readSpeakerMetadata(record: JobRecord): Record<string, string> | undefined {
  const contents = read(metadataPath(record))
  if (contents === undefined) return
  const value = JSON.parse(contents)
  if (!value || value.version !== 1 || value.id !== record.detail.id || !value.speakerNames || typeof value.speakerNames !== 'object' || Array.isArray(value.speakerNames) || Object.values(value.speakerNames).some(name => typeof name !== 'string')) throw new Error('Invalid speaker metadata')
  return normaliseSpeakerNames(record.detail.result!, value.speakerNames)
}

export function refreshSpeakerExport(record: JobRecord, names: Record<string, string>): void {
  const path = join(record.settings.outputDirectory, `${record.detail.id}.speakers.txt`)
  const text = formatTranscript(record.detail.result!, true, names)
  if (read(path) !== text) replace(path, text)
}

export function validateSpeakerExport(record: JobRecord): void {
  read(join(record.settings.outputDirectory, `${record.detail.id}.speakers.txt`))
}

export function writeSpeakerMetadata(record: JobRecord, names: Record<string, string>): void {
  replace(metadataPath(record), `${JSON.stringify({ version: 1, id: record.detail.id, speakerNames: names }, null, 2)}\n`)
}

/** Do not recreate missing output directories: an offline mount must not silently lose names. */
export function ensureSpeakerMetadata(record: JobRecord): Record<string, string> {
  const existing = readSpeakerMetadata(record)
  const names = existing ?? normaliseSpeakerNames(record.detail.result!, record.detail.speakerNames ?? {})
  if (existing === undefined) writeSpeakerMetadata(record, names)
  refreshSpeakerExport(record, names)
  // A pre-existing sidecar/export may have been supplied externally without a durable write.
  if (record.detail.speakerNames !== undefined) {
    syncExisting(metadataPath(record))
    syncExisting(join(record.settings.outputDirectory, `${record.detail.id}.speakers.txt`))
  }
  return names
}
