<script setup lang="ts">
import { nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import type { TranscriptionJob } from '../../../shared/workspace'
import TranscriptionHistoryItem from './TranscriptionHistoryItem.vue'
const props = defineProps<{ jobs: TranscriptionJob[]; selectedId: string | null; embedded?: boolean }>()
defineEmits<{ select: [id: string] }>()
const list = useTemplateRef<HTMLUListElement>('list')
const now = shallowRef(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) })
onScopeDispose(() => { if (clock) clearInterval(clock) })
// Starting a job selects its new row immediately; keep that row in view when history is scrolled.
watch(() => props.selectedId, async id => {
  await nextTick()
  if (id) list.value?.querySelector<HTMLElement>(`[data-job-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <section aria-labelledby="history-heading" class="flex min-h-0 flex-1 flex-col overflow-hidden" :class="{ 'max-h-[22rem] rounded-md border border-fb-border': !embedded }">
    <header :class="embedded ? 'sr-only' : 'flex shrink-0 items-center justify-between gap-3 border-b border-fb-border px-4 py-2'">
      <h2 id="history-heading" class="text-xs font-medium uppercase tracking-wide text-fb-muted">Transcriptions</h2>
      <slot name="actions" />
    </header>
    <p v-if="!jobs.length" class="p-4 text-sm text-fb-muted">No transcriptions yet.</p>
    <ul v-else ref="list" class="min-h-0 flex-1 divide-y divide-fb-border overflow-y-auto overscroll-contain">
      <li v-for="job in jobs" :key="job.id"><TranscriptionHistoryItem :job="job" :selected="selectedId === job.id" :now="now" @select="$emit('select', job.id)" /></li>
    </ul>
  </section>
</template>
