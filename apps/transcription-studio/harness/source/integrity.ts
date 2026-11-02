import { lstat } from 'node:fs/promises'
import { sha256 } from '../files'

export interface Fingerprint {
  sha256: string
  bytes: number
  modifiedMs: number
  mode: number
  device: number
  inode: number
}

/** Content, permissions and identity are checked; access time is excluded because reads can update it. */
export async function fingerprint(path: string): Promise<Fingerprint> {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Source must be a regular file, not a symlink')
  return {
    sha256: await sha256(path), bytes: stat.size, modifiedMs: stat.mtimeMs,
    mode: stat.mode, device: stat.dev, inode: stat.ino,
  }
}

export function assertUnchanged(expected: Fingerprint, actual: Fingerprint): void {
  if (Object.keys(expected).some(key => expected[key as keyof Fingerprint] !== actual[key as keyof Fingerprint])) {
    throw new Error('Source integrity check failed; further processing is blocked')
  }
}
