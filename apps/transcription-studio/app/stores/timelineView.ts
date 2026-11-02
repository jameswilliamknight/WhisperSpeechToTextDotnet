import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

const storageKey = 'studio.timeline-view'

export const useTimelineViewStore = defineStore('timeline-view', () => {
  const identity = shallowRef<string | null>(null)
  const expanded = shallowRef(false)
  let restored = false

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ identity: identity.value, expanded: expanded.value })) }
    catch { /* Local preferences remain usable when storage is unavailable. */ }
  }

  function select(next: string) {
    if (!restored) {
      restored = true
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
        if (typeof saved?.identity === 'string' && typeof saved.expanded === 'boolean') {
          identity.value = saved.identity
          expanded.value = saved.expanded
        }
      }
      catch { /* Ignore corrupt or unavailable browser storage. */ }
    }
    // Persist only the latest selection, rather than accumulating per-recording state.
    if (identity.value !== next) {
      identity.value = next
      expanded.value = false
    }
    persist()
  }

  function toggle() { expanded.value = !expanded.value; persist() }
  function reset() { identity.value = null; expanded.value = false; persist() }

  return { expanded, select, toggle, reset }
})
