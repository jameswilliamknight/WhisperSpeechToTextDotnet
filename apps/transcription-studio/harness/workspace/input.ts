import { constants } from 'node:fs'
import { chmod, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { fingerprint, assertUnchanged } from '../source/integrity'
import { maxInputBytes, noSymlinks } from './locations'
import type { JobRecord } from './store'

/** Copy from one no-follow descriptor; hashing the copied bytes prevents path-swap races hiding changed input. */
export async function copySource(record: JobRecord, path: string, signal?: AbortSignal): Promise<void> {
  await noSymlinks(path)
  const before = await fingerprint(path)
  if (!before.bytes || before.bytes > maxInputBytes) throw new Error('Audio must be nonempty and at most 2 GB')
  const source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await source.stat()
    if (!stat.isFile() || stat.ino !== before.inode || stat.dev !== before.device) throw new Error('Source changed before copy')
    const hash = createHash('sha256')
    await streamInput(record.inputPath, source.createReadStream({ autoClose: false }), signal, hash)
    if (hash.digest('hex') !== before.sha256) throw new Error('Source changed during copy')
    assertUnchanged(before, await fingerprint(path))
    record.original = { path, fingerprint: before }
  }
  finally { await source.close() }
}

/** Raw uploads are never read through readBody: backpressure bounds memory regardless of Content-Length. */
export async function streamInput(path: string, input: Readable, signal?: AbortSignal, hash?: ReturnType<typeof createHash>, limitBytes = maxInputBytes): Promise<void> {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 1 || limitBytes > maxInputBytes) throw new Error('Invalid input size limit')
  const output = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  let bytes = 0
  try {
    for await (const chunk of input) {
      signal?.throwIfAborted()
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > limitBytes) throw new Error('Audio exceeds the upload size limit (maximum 2 GB)')
      hash?.update(buffer)
      let offset = 0
      while (offset < buffer.length) {
        const { bytesWritten } = await output.write(buffer, offset, buffer.length - offset)
        if (!bytesWritten) throw new Error('Unable to write private input')
        offset += bytesWritten
      }
    }
    if (!bytes) throw new Error('Audio must not be empty')
    await output.sync()
  }
  finally { await output.close() }
  await chmod(path, 0o400)
}
