import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watchSourceDirectory, type SourceWatchEvent } from '../../harness/workspace/source-watch'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-watch-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  await mkdir(source)
  return { root, source }
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for directory notification')
    await Bun.sleep(10)
  }
}

function subscribe(directory: () => Promise<string>) {
  const events: SourceWatchEvent[] = []
  const stop = watchSourceDirectory({ directory, notify: event => events.push(event), reconcileMs: 30, debounceMs: 10 })
  cleanups.push(stop)
  return { events, stop, changes: () => events.filter(event => event.type === 'change').length }
}

test('notifies initially, then for add, rename, remove; stops all notifications on disposal', async () => {
  const { source } = await setup()
  const subscription = subscribe(async () => source)
  await until(() => subscription.changes() === 1)
  const first = join(source, 'first.wav')
  const second = join(source, 'renamed.wav')
  for (const mutate of [() => writeFile(first, 'audio'), () => rename(first, second), () => unlink(second)]) {
    const before = subscription.changes()
    await mutate()
    await until(() => subscription.changes() > before)
  }
  subscription.stop()
  const count = subscription.events.length
  await writeFile(first, 'after disposal')
  await Bun.sleep(100)
  expect(subscription.events).toHaveLength(count)
})

test('changes subscriptions with saved folder settings and handles an empty folder setting', async () => {
  const { root, source } = await setup()
  const other = join(root, 'other')
  await mkdir(other)
  let directory = source
  const subscription = subscribe(async () => directory)
  await until(() => subscription.changes() === 1)
  directory = other
  await until(() => subscription.changes() === 2)
  await writeFile(join(other, 'new.wav'), 'audio')
  await until(() => subscription.changes() >= 3)
  directory = ''
  const before = subscription.changes()
  await until(() => subscription.changes() > before)
  await Bun.sleep(30)
  const detached = subscription.events.length
  await writeFile(join(other, 'detached.wav'), 'audio')
  await Bun.sleep(100)
  expect(subscription.events).toHaveLength(detached)
})

test('reports unavailable folders once, then recovers after deletion and recreation', async () => {
  const { source } = await setup()
  const subscription = subscribe(async () => source)
  await until(() => subscription.changes() === 1)
  await rm(source, { recursive: true })
  await until(() => subscription.events.some(event => event.type === 'error'))
  await Bun.sleep(100)
  expect(subscription.events.filter(event => event.type === 'error')).toHaveLength(1)
  const before = subscription.changes()
  await mkdir(source)
  await until(() => subscription.changes() > before)
  const recovered = subscription.changes()
  await writeFile(join(source, 'recovered.wav'), 'audio')
  await until(() => subscription.changes() > recovered)
})

test('refuses symlink replacement and recovers from settings read failures', async () => {
  const { root, source } = await setup()
  let fail = true
  const subscription = subscribe(async () => {
    if (fail) throw new Error('Private database path must not reach notifications')
    return source
  })
  await until(() => subscription.events.length === 1)
  expect(JSON.stringify(subscription.events)).not.toContain('Private database')
  fail = false
  await until(() => subscription.changes() === 1)
  const other = join(root, 'other')
  await mkdir(other)
  await rm(source, { recursive: true })
  await symlink(other, source)
  await until(() => subscription.events.filter(event => event.type === 'error').length === 2)
  const count = subscription.events.length
  await writeFile(join(other, 'not-watched.wav'), 'audio')
  await Bun.sleep(100)
  expect(subscription.events).toHaveLength(count)
})

test('disposing during an in-flight settings read does not install a late watcher', async () => {
  const { source } = await setup()
  let resolve!: (directory: string) => void
  const subscription = subscribe(() => new Promise<string>((done) => { resolve = done }))
  subscription.stop()
  resolve(source)
  await writeFile(join(source, 'late.wav'), 'audio')
  await Bun.sleep(100)
  expect(subscription.events).toHaveLength(0)
})
