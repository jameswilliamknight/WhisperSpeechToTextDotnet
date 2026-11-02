import { afterEach, expect, test } from 'bun:test'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runProcess } from '../../harness/process'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

test('records real process timing, and does not interpret argv as shell syntax', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-process-')); directories.push(cwd)
  const result = await runProcess([process.execPath, '-e', 'console.log(process.argv[1])', '; exit 7'], { cwd, log: join(cwd, 'worker.log'), measure: true })
  expect(result.wallSeconds).toBeGreaterThan(0)
})

test('rejects failures, cancellation and timeouts', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-process-')); directories.push(cwd)
  await expect(runProcess([process.execPath, '-e', 'process.exit(9)'], { cwd, log: join(cwd, 'fail.log') })).rejects.toThrow('code 9')
  const controller = new AbortController()
  const work = runProcess([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { cwd, log: join(cwd, 'cancel.log'), signal: controller.signal })
  setTimeout(() => controller.abort(), 50)
  await expect(work).rejects.toThrow('cancelled')
  await expect(runProcess([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { cwd, log: join(cwd, 'timeout.log'), timeoutMs: 50 })).rejects.toThrow('timed out')
})

async function waitForFile(path: string): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    try { return await readFile(path, 'utf8') } catch { await Bun.sleep(25) }
  }
  throw new Error(`Fixture did not create ${path}`)
}

test('cancellation escalates after launcher exit and retains the fence until descendants stop', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-process-')); directories.push(cwd)
  const fencePath = join(cwd, 'worker-group.json')
  const ready = join(cwd, 'ready')
  const descendant = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000)`
  const launcher = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: 'ignore'}); setInterval(() => {}, 1000)`
  const controller = new AbortController()
  const work = runProcess([process.execPath, '-e', launcher], { cwd, log: join(cwd, 'worker.log'), fencePath, signal: controller.signal })
  void work.catch(() => {})
  try {
    const pid = Number(await waitForFile(ready))
    expect(JSON.parse(await readFile(fencePath, 'utf8')).pgid).toBeGreaterThan(0)
    controller.abort()
    await Bun.sleep(200)
    await access(fencePath)
    expect(() => process.kill(pid, 0)).not.toThrow()
    await expect(work).rejects.toThrow('cancelled')
    expect(() => process.kill(pid, 0)).toThrow()
    await expect(access(fencePath)).rejects.toThrow()
  }
  finally { controller.abort(); await work.catch(() => {}) }
}, 15000)

test('successful and failed workers clear their confirmed-dead group fences', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-process-')); directories.push(cwd)
  const fencePath = join(cwd, 'worker-group.json')
  await runProcess([process.execPath, '-e', 'console.log("ok")'], { cwd, log: join(cwd, 'ok.log'), fencePath })
  await expect(access(fencePath)).rejects.toThrow()
  await expect(runProcess(['/does/not/exist'], { cwd, log: join(cwd, 'fail.log'), fencePath })).rejects.toThrow()
  await expect(access(fencePath)).rejects.toThrow()
})

test('parent crash leaves a durable fence identifying the surviving detached group', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-process-')); directories.push(cwd)
  const fencePath = join(cwd, 'worker-group.json')
  const ready = join(cwd, 'ready')
  const command = [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000)`]
  const modulePath = new URL('../../harness/process.ts', import.meta.url).href
  const parent = Bun.spawn([process.execPath, '-e', `
    import { runProcess } from ${JSON.stringify(modulePath)};
    await runProcess(${JSON.stringify(command)}, ${JSON.stringify({ cwd, log: join(cwd, 'crash.log'), fencePath })});
  `], { cwd, stdout: 'ignore', stderr: 'ignore' })
  let pgid: number | undefined
  try {
    const pid = Number(await waitForFile(ready))
    const fence = JSON.parse(await readFile(fencePath, 'utf8'))
    pgid = fence.pgid
    expect(fence.ownerPid).toBe(parent.pid)
    parent.kill('SIGKILL'); await parent.exited
    expect(() => process.kill(pid, 0)).not.toThrow()
    expect(JSON.parse(await readFile(fencePath, 'utf8')).pgid).toBe(pgid)
  }
  finally {
    parent.kill('SIGKILL'); await parent.exited
    // All signals here target only the synthetic group created by this test.
    if (!pgid) {
      try { pgid = JSON.parse(await readFile(fencePath, 'utf8')).pgid } catch { /* No group was published. */ }
    }
    if (pgid) {
      try { process.kill(-pgid, 'SIGKILL') } catch { /* Already stopped. */ }
      for (let attempt = 0; attempt < 200; attempt++) {
        try { process.kill(-pgid, 0) } catch { break }
        await Bun.sleep(25)
      }
    }
  }
}, 10000)
