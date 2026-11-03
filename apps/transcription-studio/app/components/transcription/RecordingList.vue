<script setup lang="ts">
import { nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import type { RecordingRow } from '#shared/recordingRows'
import RecordingListItem from './RecordingListItem.vue'

const props = defineProps<{ rows: RecordingRow[]; selectedId: string | null; disabled: boolean; engineAvailable: boolean; configured: boolean; loading: boolean; error: string }>()
defineEmits<{ select: [id: string]; start: [row: RecordingRow]; cancel: [] }>()
const list = useTemplateRef<HTMLUListElement>('list')
const now = shallowRef(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) })
onScopeDispose(() => { if (clock) clearInterval(clock) })
watch(() => props.selectedId, async id => {
  await nextTick()
  const row = props.rows.find(row => id && row.jobIds.includes(id))
  if (row) [...list.value?.children ?? []].find(element => (element as HTMLElement).dataset.recordingId === row.id)?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <section aria-labelledby="recordings-heading" class="scrollbar-area flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border-2 border-fb-border">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-fb-border px-3 py-3"><h2 id="recordings-heading" class="text-sm font-medium">Recordings</h2><slot name="actions" /></header>
    <slot name="input" />
    <p v-if="!configured" class="px-3 py-2 text-xs text-fb-muted">Choose a recordings folder in <NuxtLink to="/settings" class="underline">Settings</NuxtLink>, or choose/drop an audio file above.</p>
    <p v-if="loading && !rows.length" role="status" class="p-3 text-xs text-fb-muted">Loading recordings…</p>
    <p v-if="error" role="alert" class="p-3 text-sm text-fb-danger">{{ error }}</p>
    <p v-if="!rows.length && !loading" class="p-3 text-xs text-fb-muted">No recordings yet. New files appear automatically.</p>
    <ul ref="list" aria-label="Recording files" class="hover-scrollbar min-h-0 flex-1 divide-y divide-fb-border overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
      <RecordingListItem v-for="row in rows" :key="row.id" :row="row" :selected="!!selectedId && row.jobIds.includes(selectedId)" :disabled="disabled" :engine-available="engineAvailable" :now="now" @select="$emit('select', $event)" @start="$emit('start', row)" @cancel="$emit('cancel')" />
    </ul>
  </section>
</template>
