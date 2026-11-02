import { constants } from 'node:fs'
import { access, lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, normalize, parse, resolve } from 'node:path'
import type { LocationSettings, SourceFile } from '../../shared/workspace'
import { normaliseDirectoryPath } from '../../shared/normaliseDirectoryPath'
import { privateRoot, studioRoot } from '../paths'

export const maxInputBytes = 2 * 1024 ** 3
const extensions = new Set(['.wav', '.mp3', '.m4a', '.mp4', '.aac', '.flac', '.ogg', '.opus', '.aiff', '.aif', '.wma', '.webm'])
export const defaults: LocationSettings = { sourceDirectory: '', workingDirectory: join(privateRoot, 'work'), outputDirectory: join(privateRoot, 'transcripts') }
export const inside = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`)

export function sourceName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 240 || basename(value) !== value || value.includes('\\') || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !extensions.has(extname(value).toLowerCase())) {
    throw new Error('Choose a supported audio filename without directory components')
  }
  return value
}

/** Check every existing ancestor: realpath on only the leaf would miss a missing leaf below a symlink. */
export async function noSymlinks(path: string): Promise<void> {
  let current = parse(path).root
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Directory locations must not contain symlinks')
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

/** Resolve filesystem spelling (including case aliases) without creating a missing working/output suffix. */
async function canonicalLocation(path: string): Promise<string> {
  const suffix: string[] = []
  let ancestor = path
  for (;;) {
    try { return join(await realpath(ancestor), ...suffix) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
      suffix.unshift(basename(ancestor))
      ancestor = dirname(ancestor)
    }
  }
}

async function validateLocation(value: unknown, source: boolean): Promise<string> {
  if (typeof value === 'string') value = normaliseDirectoryPath(value)
  if (source && value === '') return ''
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0') || normalize(value) !== value || value === parse(value).root) throw new Error('Locations must be normalised absolute directory paths, not filesystem roots')
  await noSymlinks(value)
  const path = await canonicalLocation(value)
  try { if (!(await lstat(path)).isDirectory()) throw new Error('Location must be a directory') }
  catch (error) { if (source || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (source) { await access(path, constants.R_OK); return path }
  // Only the app-private tree is permitted inside a checkout; user-selected external locations remain supported.
  const privatePath = await canonicalLocation(privateRoot)
  const studioPath = await canonicalLocation(studioRoot)
  if (!inside(path, privatePath) || path === privatePath) {
    if (inside(path, studioPath) || inside(studioPath, path)) throw new Error('Working/output locations must not contain application source')
    for (let parent = path; parent !== dirname(parent); parent = dirname(parent)) {
      try { await lstat(join(parent, '.git')); throw new Error('Working/output locations must not be inside a Git checkout') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    if (['/etc', '/usr', '/bin', '/sbin', '/System', '/Library', '/Applications', '/private/etc', '/private/var/db'].some(root => inside(path, root)) || ['/var', '/private', '/private/var', '/Users', '/Volumes'].includes(path)) throw new Error('Choose a user-owned working/output directory')
  }
  return path
}

export async function validateSettings(input: LocationSettings): Promise<LocationSettings> {
  const sourceDirectory = await validateLocation(input.sourceDirectory, true)
  const workingDirectory = await validateLocation(input.workingDirectory, false)
  const outputDirectory = await validateLocation(input.outputDirectory, false)
  const privatePath = await canonicalLocation(privateRoot)
  if (sourceDirectory && [workingDirectory, outputDirectory, privatePath].some(path => inside(path, sourceDirectory) || inside(sourceDirectory, path))) throw new Error('Source must be separate from all working, output and private state locations')
  if (inside(workingDirectory, outputDirectory) || inside(outputDirectory, workingDirectory)) throw new Error('Working and output directories must be separate')
  return { sourceDirectory, workingDirectory, outputDirectory }
}

export async function writableDirectory(path: string): Promise<void> {
  await noSymlinks(path)
  // Never chmod an existing user-selected directory: only newly created private artifacts are ours.
  await mkdir(path, { recursive: true, mode: 0o700 })
  if (await realpath(path) !== path) throw new Error('Directory location changed')
}

export async function sourceFiles(settings: LocationSettings): Promise<SourceFile[]> {
  if (!settings.sourceDirectory) return []
  await validateSettings(settings)
  const files: SourceFile[] = []
  for (const entry of await readdir(settings.sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    try { sourceName(entry.name) } catch { continue }
    try {
      const stat = await lstat(resolve(settings.sourceDirectory, entry.name))
      if (stat.isFile() && stat.size > 0 && stat.size <= maxInputBytes) files.push({ name: entry.name, bytes: stat.size, modifiedAt: stat.mtime.toISOString() })
    }
    // An actively watched folder may change between readdir and lstat.
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}
