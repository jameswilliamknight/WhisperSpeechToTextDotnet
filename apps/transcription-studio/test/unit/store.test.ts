import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

const directories: string[] = []
const modulePath = new URL('../../harness/runs/store.ts', import.meta.url).href
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-store-')))
  directories.push(root)
  return root
}

async function script(root: string, body: string): Promise<{ code: number; output: string }> {
  const worker = Bun.spawn([process.execPath, '-e', `import { acquireRunLock, recoverInterruptedRuns, saveRun, listRuns } from ${JSON.stringify(modulePath)}; ${body}`], {
    cwd: root, env: { ...process.env, STUDIO_ROOT: root }, stdout: 'pipe', stderr: 'pipe',
  })
  const [code, output, error] = await Promise.all([worker.exited, new Response(worker.stdout).text(), new Response(worker.stderr).text()])
  return { code, output: output + error }
}

test('cross-process acquisition is exclusive and release is token-safe and idempotent', async () => {
  const root = await fixture()
  const contenders = await Promise.all(Array.from({ length: 6 }, () => script(root, `
    try { const release = await acquireRunLock(); console.log('ACQUIRED'); await Bun.sleep(500); await release() }
    catch (error) { console.log('BUSY') }
  `)))
  expect(contenders.filter(result => result.output.includes('ACQUIRED'))).toHaveLength(1)
  expect(contenders.every(result => result.code === 0)).toBe(true)
  const result = await script(root, `
    const oldRelease = await acquireRunLock(); await oldRelease();
    const newRelease = await acquireRunLock(); await oldRelease();
    try { await acquireRunLock(); throw new Error('incorrect admission') }
    catch (error) { if (!error.message.includes('already running')) throw error }
    await newRelease(); const finalRelease = await acquireRunLock(); await finalRelease();
  `)
  expect(result).toEqual({ code: 0, output: '' })
})

test('recovery does not interrupt live owners, and recovers after their process dies', async () => {
  const root = await fixture()
  const id = crypto.randomUUID()
  const owner = Bun.spawn([process.execPath, '-e', `
    import { acquireRunLock, saveRun } from ${JSON.stringify(modulePath)};
    await acquireRunLock();
    await saveRun({id: ${JSON.stringify(id)}, status: 'running', startedAt: '2026-01-01'});
    console.log('READY'); await new Response(Bun.stdin.stream()).text();
  `], { cwd: root, env: { ...process.env, STUDIO_ROOT: root }, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
  try {
    const reader = owner.stdout.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('READY')
    reader.releaseLock()
    const recovered = await script(root, `await Promise.all([recoverInterruptedRuns(), recoverInterruptedRuns()]); console.log((await listRuns())[0].status)`)
    expect(recovered.output.trim()).toBe('running')
    owner.stdin.end(); await owner.exited
    const result = await script(root, `await recoverInterruptedRuns(); console.log((await listRuns())[0].status); const release = await acquireRunLock(); await release()`)
    expect(result.code).toBe(0)
    expect(result.output.trim()).toBe('interrupted')
  }
  finally { owner.kill(); await owner.exited }
})

test('legacy live locks block migration; SQLite crash recovery has no incomplete JSON window', async () => {
  const root = await fixture()
  expect((await script(root, `const release = await acquireRunLock(); await release()`)).code).toBe(0)
  await writeFile(join(root, '.local/run.lock'), JSON.stringify({ pid: process.pid }))
  const blocked = await script(root, `await acquireRunLock()`)
  expect(blocked.code).not.toBe(0)
  expect(blocked.output).toContain('already running')
  await rm(join(root, '.local/run.lock'))
  expect((await script(root, `await acquireRunLock(); process.exit(0)`)).code).toBe(0)
  expect((await script(root, `const release = await acquireRunLock(); await release()`)).code).toBe(0)
})

test('concurrent recovery and admission never interrupt a newly admitted run', async () => {
  const root = await fixture()
  const owner = script(root, `
    const release = await acquireRunLock();
    const id = crypto.randomUUID(); await saveRun({id, status: 'running', startedAt: '2026-01-01'});
    await Bun.sleep(400);
    if ((await listRuns()).find(run => run.id === id)?.status !== 'running') throw new Error('Recovery overwrote active run');
    await saveRun({id, status: 'succeeded', startedAt: '2026-01-01'}); await release();
  `)
  const recoveries = await Promise.all(Array.from({ length: 6 }, () => script(root, `
    for (let attempt = 0; attempt < 15; attempt++) { await recoverInterruptedRuns(); await Bun.sleep(20) }
  `)))
  expect(await owner).toEqual({ code: 0, output: '' })
  expect(recoveries.every(result => result.code === 0)).toBe(true)
})

test('a live orphan group fences acquisition without recovery killing it', async () => {
  const root = await fixture()
  expect((await script(root, `const release = await acquireRunLock(); await release()`)).code).toBe(0)
  // Obtain a known-dead owner PID, rather than guessing a PID that could belong to another process.
  const dead = Bun.spawn([process.execPath, '-e', ''], { stdout: 'ignore', stderr: 'ignore' })
  await dead.exited
  const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  try {
    await writeFile(join(root, '.local/worker-group.json'), JSON.stringify({ token: 'fixture', ownerPid: dead.pid, pgid: orphan.pid }))
    const result = await script(root, `await recoverInterruptedRuns(); await acquireRunLock()`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('already running')
    expect(() => process.kill(orphan.pid!, 0)).not.toThrow()
  }
  finally {
    const closed = new Promise(resolve => orphan.once('close', resolve))
    process.kill(-orphan.pid!, 'SIGKILL'); await closed
  }
  expect((await script(root, `const release = await acquireRunLock(); await release()`)).code).toBe(0)
  expect(JSON.parse(await readFile(join(root, '.local/worker-group.json'), 'utf8')).token).toBe('fixture')
})
