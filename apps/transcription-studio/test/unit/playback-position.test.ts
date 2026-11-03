import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createPinia, setActivePinia } from 'pinia'
import { usePlaybackPositionStore } from '~/stores/playbackPosition'

const key = 'studio.playback-position'
let storage: Map<string, string>
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
beforeEach(() => {
  setActivePinia(createPinia())
  storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  } })
})
afterEach(() => {
  usePlaybackPositionStore().flush()
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('remembers position and playback intent per opaque identity and flushes the latest state', () => {
  const store = usePlaybackPositionStore()
  store.remember('recording:one', 62.12345, true)
  store.remember('recording:two', 12, false)
  expect(store.get('recording:one')).toEqual({ seconds: 62.123, playing: true })
  expect(store.get('recording:two')).toEqual({ seconds: 12, playing: false })
  expect(store.get('run:one')).toEqual({ seconds: 0, playing: false })
  expect(storage.has(key)).toBe(false)
  store.flush()
  setActivePinia(createPinia())
  expect(usePlaybackPositionStore().get('recording:one')).toEqual({ seconds: 62.123, playing: true })
})

test('rejects invalid persisted values without discarding valid recordings', () => {
  storage.set(key, JSON.stringify({ version: 1, positions: {
    good: { seconds: 23, playing: false }, negative: { seconds: -1, playing: true },
    text: { seconds: '20', playing: true }, missing: { seconds: 2 }, nothing: null,
  } }))
  const store = usePlaybackPositionStore()
  expect(store.get('good').seconds).toBe(23)
  expect(Object.keys(store.positions)).toEqual(['good'])
  for (const seconds of [NaN, Infinity, -1]) store.remember('invalid', seconds, true)
  expect(store.get('invalid')).toEqual({ seconds: 0, playing: false })
})

test('corrupt and unknown-version storage defaults to paused at zero', () => {
  for (const saved of ['not-json', '{"version":99,"positions":{}}', '{"version":1,"positions":[]}']) {
    storage.set(key, saved)
    setActivePinia(createPinia())
    expect(usePlaybackPositionStore().get('one')).toEqual({ seconds: 0, playing: false })
  }
})

test('blocked storage keeps the in-memory position and playing state usable', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Blocked') } })
  const store = usePlaybackPositionStore()
  store.remember('one', 32, true)
  expect(() => store.flush()).not.toThrow()
  expect(store.get('one')).toEqual({ seconds: 32, playing: true })
})
