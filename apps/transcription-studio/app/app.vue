<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from './stores/workspace'

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
      <div class="mx-auto flex max-w-screen-2xl items-center justify-between px-8 py-5">
        <span class="text-lg font-semibold tracking-tight">Transcription Studio</span>
        <nav aria-label="Main navigation" class="flex gap-6 text-sm">
          <NuxtLink to="/" class="rounded text-fb-muted hover:text-fb-foreground focus-visible:outline-2 focus-visible:outline-fb-primary" active-class="!text-fb-primary" exact-active-class="font-semibold">Transcribe</NuxtLink>
          <NuxtLink to="/settings" class="rounded text-fb-muted hover:text-fb-foreground focus-visible:outline-2 focus-visible:outline-fb-primary" active-class="!text-fb-primary">Settings</NuxtLink>
        </nav>
      </div>
    </header>
    <main class="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col overflow-y-auto px-8 py-8">
      <div class="flex min-h-0 flex-1 flex-col"><NuxtPage /></div>
    </main>
  </div>
</template>
