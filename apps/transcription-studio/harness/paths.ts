import { resolve } from 'node:path'
import { lstat, mkdir, realpath } from 'node:fs/promises'

// Explicit override also supports the built Nitro server, whose import.meta.url is relocated.
export const studioRoot = resolve(process.env.STUDIO_ROOT || process.cwd())
export const privateRoot = resolve(studioRoot, '.local')
export const appsRoot = resolve(studioRoot, '..')

/** Refuse symlinked state directories before any private recording/transcript is written. */
export async function privateDirectory(path: string): Promise<string> {
  if (path !== privateRoot && !path.startsWith(`${privateRoot}/`)) throw new Error('Not a private Studio path')
  await mkdir(privateRoot, { recursive: true, mode: 0o700 })
  if ((await lstat(privateRoot)).isSymbolicLink() || await realpath(privateRoot) !== privateRoot) {
    throw new Error('Studio private directory must not be a symlink')
  }
  const relative = path.slice(privateRoot.length).split('/').filter(Boolean)
  let current = privateRoot
  for (const part of relative) {
    current = resolve(current, part)
    await mkdir(current, { recursive: true, mode: 0o700 })
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Private subdirectory must not be a symlink')
  }
  return path
}
