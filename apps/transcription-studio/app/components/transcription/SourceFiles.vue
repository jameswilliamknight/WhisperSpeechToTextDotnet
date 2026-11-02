<script setup lang="ts">
import type { SourceFile } from '../../../shared/workspace'
import { bytesLabel } from '../../utils/studioFormat'

defineProps<{ files: SourceFile[]; configured: boolean; loading: boolean; disabled: boolean; selected: string; error: string }>()
defineEmits<{ select: [name: string] }>()
</script>

<template>
  <section aria-label="Recording files" class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
    <p v-if="!configured" class="text-xs text-fb-muted">Choose a recordings folder in <NuxtLink to="/settings" class="underline">Settings</NuxtLink> to list files here.</p>
    <p v-else-if="!files.length && !loading && !error" class="text-xs text-fb-muted">No supported recordings in this folder. New files appear automatically.</p>
    <p v-if="loading && !files.length" role="status" class="text-xs text-fb-muted">Loading recordings…</p>
    <p v-if="error" role="alert" class="text-sm text-fb-danger">{{ error }}</p>
    <ul v-if="files.length" class="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain" aria-label="Source audio files">
      <li v-for="file in files" :key="file.name"><button type="button" :disabled="disabled" :aria-pressed="selected === file.name" class="flex w-full items-center justify-between gap-3 rounded border border-fb-border px-3 py-2 text-left text-sm hover:bg-fb-surface-muted focus-visible:outline-2 focus-visible:outline-fb-primary disabled:opacity-50" :class="{ 'bg-fb-primary-soft/20': selected === file.name }" @click="$emit('select', file.name)"><span class="truncate">{{ file.name }}</span><span class="shrink-0 text-xs text-fb-muted">{{ bytesLabel(file.bytes) }}</span></button></li>
    </ul>
  </section>
</template>
