import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, rename, writeFile } from 'node:fs/promises'

/** O_NOFOLLOW prevents a changed final path redirecting a read onto an unexpected file. */
export async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
    return hash.digest('hex')
  }
  finally { await handle.close() }
}

export async function readJson<T>(path: string): Promise<T> {
  if ((await lstat(path)).isSymbolicLink()) throw new Error('Refusing symlinked private file')
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}
