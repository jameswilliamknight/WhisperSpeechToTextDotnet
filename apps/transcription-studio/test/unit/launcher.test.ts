import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function invoke(args: string[], home?: string) {
  const process = Bun.spawn(args, {
    cwd: home ?? tmpdir(), env: { ...Bun.env, ...(home ? { HOME: home } : {}) }, stdout: 'pipe', stderr: 'pipe',
  })
  const [code, output, error] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
  return { code, output, error }
}

test('installer preserves zsh configuration and adds its PATH entry only once', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'transcribe-install-')))
  directories.push(home)
  const original = '# existing configuration\nexport KEEP_THIS=yes\n'
  await writeFile(join(home, '.zshrc'), original)
  const command = ['bash', join(repository, 'bin/install'), '--skip-deps']
  expect((await invoke(command, home)).code).toBe(0)
  const first = await readFile(join(home, '.zshrc'), 'utf8')
  expect(first.startsWith(original)).toBe(true)
  expect(first).toContain('# transcribe: added by bin/install')
  expect((await invoke(command, home)).code).toBe(0)
  expect(await readFile(join(home, '.zshrc'), 'utf8')).toBe(first)
  expect((await readdir(home)).filter(name => name.startsWith('.zshrc.transcribe-backup-'))).toHaveLength(1)
  const resolved = await invoke(['zsh', '-c', 'source "$HOME/.zshrc"; command -v transcribe'], home)
  expect(resolved.code).toBe(0)
  expect(resolved.output.trim()).toBe(join(repository, 'bin/transcribe'))
})

test('transcribe provides help from any working directory without starting a service', async () => {
  const result = await invoke(['bash', join(repository, 'bin/transcribe'), '--help'])
  expect(result.code).toBe(0)
  expect(result.output).toContain('Usage: transcribe')
  expect(result.output).toContain('--headless')
  expect((await invoke(['bash', join(repository, 'bin/transcribe'), '--unknown'])).code).toBe(2)
})
