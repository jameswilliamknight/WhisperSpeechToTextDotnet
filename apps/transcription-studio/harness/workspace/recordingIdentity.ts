import { createHash } from 'node:crypto'

/** Paths stay server-side; equal basenames in different folders stay distinct. */
export function directoryRecordingId(path: string): string {
  return createHash('sha256').update(`directory\0${path}`).digest('hex')
}
export function uploadRecordingId(name: string, sha256: string): string {
  return createHash('sha256').update(`upload\0${name}\0${sha256}`).digest('hex')
}
