import { fstatSync } from 'node:fs'
import { lstat, open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { formatTranscript } from '../../shared/transcriptText'
import { assertUnchanged, fingerprint } from '../source/integrity'
import { noSymlinks } from './locations'
import { commitSucceeded, job, type JobRecord } from './store'

interface CreatedOutput { path: string; device: number; inode: number }
export interface FinalizationHooks {
  afterExport?: (path: string, index: number) => Promise<void>
  beforeCommit?: () => Promise<void>
}

async function rollback(created: CreatedOutput[]): Promise<void> {
  for (const output of created) {
    try {
      const stat = await lstat(output.path)
      // Do not remove a pre-existing collision, symlink, or a replacement supplied after our exclusive create.
      if (stat.isFile() && stat.dev === output.device && stat.ino === output.inode) await unlink(output.path)
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

/** Hooks are deterministic filesystem-boundary seams for synthetic tests, never browser-supplied options. */
export async function finalizeTranscript(record: JobRecord, controller: AbortController, started: number, hooks: FinalizationHooks = {}): Promise<void> {
  const created: CreatedOutput[] = []
  const checkpoint = async () => {
    controller.signal.throwIfAborted()
    if ((await job(record.detail.id)).cancelRequested) controller.abort()
    controller.signal.throwIfAborted()
  }
  const verifyOriginal = async () => {
    if (record.original) assertUnchanged(record.original.fingerprint, await fingerprint(record.original.path))
    await checkpoint()
  }
  try {
    await verifyOriginal()
    await noSymlinks(record.settings.outputDirectory)
    await checkpoint()
    for (const [index, labelled] of [false, true].entries()) {
      const path = join(record.settings.outputDirectory, `${record.detail.id}${labelled ? '.speakers' : ''}.txt`)
      const handle = await open(path, 'wx', 0o600)
      try {
        const identity = fstatSync(handle.fd)
        created.push({ path, device: identity.dev, inode: identity.ino })
        await checkpoint()
        await handle.writeFile(formatTranscript(record.detail.result!, labelled))
        await checkpoint()
        await handle.sync()
        await checkpoint()
      }
      finally { await handle.close() }
      await hooks.afterExport?.(path, index)
      await checkpoint()
    }
    await hooks.beforeCommit?.()
    await verifyOriginal()
    record.detail.outputPath = created[0]!.path
    record.detail.status = 'succeeded'
    record.detail.phase = 'Complete'
    record.detail.progress = { stage: 'Complete', percent: 100, updatedAt: new Date().toISOString() }
    record.detail.finishedAt = new Date().toISOString()
    record.detail.wallSeconds = (performance.now() - started) / 1000
    // If cancellation won while SQLite was opening, roll back exports before persisting a cancelled terminal record.
    if (!await commitSucceeded(record, controller.signal)) { controller.abort(); controller.signal.throwIfAborted() }
  }
  catch (error) {
    delete record.detail.outputPath
    delete record.detail.progress
    await rollback(created)
    throw error
  }
}
