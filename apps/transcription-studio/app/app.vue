<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from './stores/workspace'
import ConnectionStatus from '~/components/ConnectionStatus.vue'
import StudioScreenCache from '~/components/StudioScreenCache.vue'

const workspace = useWorkspaceStore()
let timer: ReturnType<typeof setInterval> | undefined
// Keep active-job metadata current across navigation, without loading benchmark data.
onMounted(() => { timer = setInterval(() => { if (workspace.snapshot?.activeJobId) void workspace.refresh() }, 1000) })
onUnmounted(() => clearInterval(timer))

useHead({ title: 'Transcription Studio', htmlAttrs: { class: 'dark', lang: 'en-NZ' } })
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-fb-canvas text-fb-foreground">
    <header class="shrink-0 border-b border-fb-border bg-fb-surface-muted/20">
      <div class="relative mx-auto flex max-w-screen-2xl items-center justify-between px-8 py-5">
        <span class="text-lg font-semibold tracking-tight">Transcription Studio</span>
        <ConnectionStatus :reconnecting="workspace.sourceReconnecting" />
        <nav aria-label="Main navigation" class="-my-5 flex self-stretch gap-6 text-sm font-medium">
          <NuxtLink to="/" class="flex items-center border-b-2 border-transparent py-5 text-fb-muted hover:text-fb-foreground focus-visible:outline-2 focus-visible:outline-fb-primary" exact-active-class="!border-fb-primary !text-fb-primary">Transcribe</NuxtLink>
          <NuxtLink to="/benchmarks" class="flex items-center border-b-2 border-transparent py-5 text-fb-muted hover:text-fb-foreground focus-visible:outline-2 focus-visible:outline-fb-primary" exact-active-class="!border-fb-primary !text-fb-primary">Benchmarks</NuxtLink>
          <NuxtLink to="/settings" class="flex items-center border-b-2 border-transparent py-5 text-fb-muted hover:text-fb-foreground focus-visible:outline-2 focus-visible:outline-fb-primary" exact-active-class="!border-fb-primary !text-fb-primary">Settings</NuxtLink>
        </nav>
      </div>
    </header>
    <main class="scrollbar-area hover-scrollbar mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col overflow-y-auto px-8 py-8">
      <div class="flex min-h-0 flex-1 flex-col"><StudioScreenCache /><NuxtPage /></div>
    </main>
  </div>
</template>
