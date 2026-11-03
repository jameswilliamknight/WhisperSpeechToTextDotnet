import { defineStore } from 'pinia'
import { shallowReactive, shallowRef } from 'vue'

const storageKey = 'studio.timeline-view'

export const useTimelineViewStore = defineStore('timeline-view', () => {
  const identity = shallowRef<string | null>(null)
  const expanded = shallowRef(false)
  const cachedViews = shallowReactive(new Map<string, boolean>())
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
      if (identity.value) cachedViews.set(identity.value, expanded.value)
      identity.value = next
      expanded.value = cachedViews.get(next) ?? false
    }
    persist()
  }

  function toggle() { expanded.value = !expanded.value; persist() }
  function reset() { cachedViews.clear(); identity.value = null; expanded.value = false; persist() }
  function expandedFor(key: string) { return key === identity.value ? expanded.value : cachedViews.get(key) ?? false }

  return { expanded, expandedFor, select, toggle, reset }
})
