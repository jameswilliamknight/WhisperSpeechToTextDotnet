<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef } from 'vue'
import WorkspaceView from './transcription/WorkspaceView.vue'
import StudioWorkbench from './studio/StudioWorkbench.vue'
import SettingsView from './transcription/SettingsView.vue'
import ScreenCacheEntry from './ScreenCacheEntry.vue'

// Static imports load all three screens together. Warm each KeepAlive entry
// once, then move retained trees rather than recreating media/transcript DOM.
// Route pages are intentionally empty: this app-level host outlives navigation.
const screens = { '/': WorkspaceView, '/benchmarks': StudioWorkbench, '/settings': SettingsView }
type ScreenPath = keyof typeof screens
const route = useRoute()
const isScreenPath = (path: string): path is ScreenPath => path in screens
const ready = shallowRef(false)
const warming = shallowRef<ScreenPath | null>(null)
const path = computed(() => warming.value ?? (isScreenPath(route.path) ? route.path : '/'))
const activePath = computed(() => ready.value ? route.path : '')

onMounted(async () => {
  for (const screen of Object.keys(screens) as ScreenPath[]) {
    warming.value = screen
    await nextTick()
  }
  warming.value = null
  await nextTick()
  ready.value = true
})
</script>

<template>
  <div v-show="isScreenPath(route.path)" class="flex min-h-0 flex-1 flex-col" :data-screens-ready="ready" :aria-busy="!ready">
    <div v-show="ready" class="flex min-h-0 flex-1 flex-col">
      <KeepAlive :max="3">
        <ScreenCacheEntry :key="path" :screen="screens[path]" :path="path" :active-path="activePath" :ready="ready" />
      </KeepAlive>
    </div>
  </div>
</template>
