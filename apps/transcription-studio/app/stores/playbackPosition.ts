import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export interface PlaybackPosition { seconds: number; playing: boolean }
const storageKey = 'studio.playback-position'

/** Browser-local resume state contains opaque IDs and media state only, never
 * transcript text or file paths. Pinia updates immediately; disk writes are
 * coalesced so the animation-frame media clock does not hammer localStorage. */
export const usePlaybackPositionStore = defineStore('playback-position', () => {
  const positions = shallowRef<Record<string, PlaybackPosition>>({})
  let restored = false
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function restore() {
    if (restored) return
    restored = true
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved?.version !== 1 || !saved.positions || typeof saved.positions !== 'object' || Array.isArray(saved.positions)) return
      positions.value = Object.fromEntries(Object.entries(saved.positions).filter(([key, value]) => {
        const entry = value as PlaybackPosition | null
        return key.length > 0 && entry && typeof entry.seconds === 'number' && Number.isFinite(entry.seconds) && entry.seconds >= 0 && typeof entry.playing === 'boolean'
      })) as Record<string, PlaybackPosition>
    }
    catch { /* Missing, blocked or corrupt storage must never prevent playback. */ }
  }

  function get(identity: string): PlaybackPosition {
    restore()
    return Object.hasOwn(positions.value, identity) ? { ...positions.value[identity]! } : { seconds: 0, playing: false }
  }

  function flush() {
    clearTimeout(timer); timer = undefined
    if (!dirty) return
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, positions: positions.value })); dirty = false }
    catch { /* Keep the Pinia state usable if browser storage is unavailable. */ }
  }

  function remember(identity: string, seconds: number, playing: boolean) {
    if (!identity || !Number.isFinite(seconds) || seconds < 0) return
    restore()
    const previous = positions.value[identity]
    // Milliseconds are enough for restoring playback, without frame-sized churn.
    const value = Math.round(seconds * 1000) / 1000
    if (previous?.seconds === value && previous.playing === playing) return
    positions.value = { ...positions.value, [identity]: { seconds: value, playing } }
    dirty = true
    timer ??= setTimeout(flush, 500)
  }

  return { positions, get, remember, flush }
})
