import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fingerprint, assertUnchanged } from '../../harness/source/integrity'

const directories: string[] = []
const cli = resolve('tool/bench.ts')
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-source-'))); directories.push(root)
  const studio = join(root, 'studio')
  const source = join(root, 'synthetic.mp3')
  await mkdir(join(studio, '.local'), { recursive: true })
  const ffmpeg = Bun.spawn(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', source], { stdout: 'ignore', stderr: 'ignore' })
  expect(await ffmpeg.exited).toBe(0)
  await writeFile(join(studio, '.local/config.json'), JSON.stringify({ sourcePath: source }))
  return { studio, source }
}

async function invoke(studio: string, args = ['prepare']) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    env: { ...process.env, STUDIO_ROOT: studio }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { stdout, stderr, code }
}

test('copies and verifies without changing original; detects later tampering', async () => {
  const { studio, source } = await fixture()
  const before = await fingerprint(source)
  const first = await invoke(studio)
  expect(first.code, first.stderr).toBe(0)
  expect(JSON.parse(first.stdout).prepared).toBe(true)
  assertUnchanged(before, await fingerprint(source))
  expect(await readFile(join(studio, '.local/recordings/source.mp3'))).toEqual(await readFile(source))
  expect((await invoke(studio)).code).toBe(0)
  await writeFile(source, 'tampered synthetic fixture')
  const changed = await invoke(studio)
  expect(changed.code).not.toBe(0)
  expect(changed.stderr).toContain('integrity check failed')
})

test('refuses orphan copy overwrite and symlinked recording directory', async () => {
  const { studio } = await fixture()
  await mkdir(join(studio, '.local/recordings'))
  await writeFile(join(studio, '.local/recordings/source.mp3'), 'do not overwrite')
  expect((await invoke(studio)).code).not.toBe(0)
  expect(await readFile(join(studio, '.local/recordings/source.mp3'), 'utf8')).toBe('do not overwrite')
  const second = await fixture()
  await symlink(join(second.studio, '..'), join(second.studio, '.local/recordings'))
  expect((await invoke(second.studio)).code).not.toBe(0)
})

test('recovers abandoned runs but preserves a live cross-process lock', async () => {
  const { studio } = await fixture()
  const id = '00000000-0000-0000-0000-000000000001'
  const directory = join(studio, '.local/runs', id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'run.json'), JSON.stringify({
    id, backend: 'nemo', preset: 'full', status: 'running', phase: 'Test fixture', startedAt: '',
  }))
  await writeFile(join(studio, '.local/run.lock'), JSON.stringify({ pid: process.pid }))
  const live = await invoke(studio, ['status'])
  expect(live.code).toBe(0)
  expect(JSON.parse(live.stdout).activeRunId).toBe(id)
  await unlink(join(studio, '.local/run.lock'))
  const abandoned = await invoke(studio, ['status'])
  expect(abandoned.code).toBe(0)
  expect(JSON.parse(abandoned.stdout).activeRunId).toBeNull()
  expect(JSON.parse(abandoned.stdout).runs[0].status).toBe('interrupted')
})

test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')('serial CLI runs retain their lock through finalisation and record OS provenance', async () => {
  const { studio } = await fixture()
  const worker = join(studio, '.local/synthetic-worker.ts')
  await writeFile(worker, `
    const output = process.argv[process.argv.indexOf('--output') + 1];
    await Bun.write(output, JSON.stringify({
      segments: [{ start: 0, end: 0.5, text: 'SYNTHETIC UNIT FIXTURE', speaker: 'fixture' }],
      turns: [{ start: 0, end: 0.5, speaker: 'fixture' }], stages: {}, warnings: [],
      metadata: { runtime: 'unit-test-only', models: ['synthetic'], backend: 'fixture' }
    }));
  `)
  await writeFile(join(studio, '.local/adapters.json'), JSON.stringify({
    nemo: { command: [process.execPath, worker], cwd: studio },
  }))
  for (let i = 0; i < 2; i++) {
    const result = await invoke(studio, ['run', 'nemo', 'full'])
    expect(result.code, result.stderr).toBe(0)
    const summary = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))
    expect(summary.status).toBe('succeeded')
    expect(summary.integrityVerified).toBe(true)
    expect(typeof summary.environment.os).toBe('string')
  }
  const snapshot = await invoke(studio, ['status'])
  expect(JSON.parse(snapshot.stdout).runs).toHaveLength(2)
})
