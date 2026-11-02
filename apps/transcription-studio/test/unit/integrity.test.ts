import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertUnchanged, fingerprint } from '../../harness/source/integrity'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('read-only source fingerprint', () => {
  test('reading preserves content, permissions, modification time and identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-integrity-')); directories.push(directory)
    const path = join(directory, 'source.mp3')
    await writeFile(path, 'synthetic fixture')
    await chmod(path, 0o400)
    const before = await fingerprint(path)
    assertUnchanged(before, await fingerprint(path))
    expect(before.bytes).toBe(17)
  })

  test('rejects content changes and symlinked originals', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-integrity-')); directories.push(directory)
    const path = join(directory, 'source.mp3')
    await writeFile(path, 'before')
    const before = await fingerprint(path)
    await writeFile(path, 'after')
    expect(() => assertUnchanged(before, { ...before, sha256: 'changed' })).toThrow('integrity')
    expect(() => assertUnchanged(before, { ...before, mode: before.mode + 1 })).toThrow('integrity')
    await symlink(path, join(directory, 'link.mp3'))
    await expect(fingerprint(join(directory, 'link.mp3'))).rejects.toThrow('regular file')
    expect(() => assertUnchanged(before, before)).not.toThrow()
  })
})
