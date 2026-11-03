import { Database } from 'bun:sqlite'
import { chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { privateDirectory, privateRoot } from '../paths'
import { noSymlinks } from './locations'

/** VACUUM INTO includes committed WAL state. Backups contain confidential data
 * and must never be printed or put in Git, even after history is cleaned. */
export async function backupWorkspace(label: string): Promise<string> {
  if (!/^[a-z-]+$/.test(label)) throw new Error('Invalid backup label')
  const database = join(privateRoot, 'workspace.sqlite')
  await noSymlinks(database)
  const directory = join(privateRoot, 'backups')
  await privateDirectory(directory)
  const path = join(directory, `${label}-${crypto.randomUUID()}.sqlite`)
  const db = new Database(database, { readonly: true })
  try { db.query('VACUUM INTO ?').run(path) } finally { db.close() }
  await chmod(path, 0o600)
  return path
}
