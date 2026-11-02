<script setup lang="ts">
import { shallowRef } from 'vue'

const props = withDefaults(defineProps<{ initialTab?: 'recent' | 'library' }>(), { initialTab: 'recent' })
const selected = shallowRef<'recent' | 'library'>(props.initialTab)
const tabs = [{ id: 'recent', label: 'Transcriptions' }, { id: 'library', label: 'Recordings' }] as const
function navigate(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  selected.value = event.key === 'Home' ? 'recent' : event.key === 'End' ? 'library' : selected.value === 'recent' ? 'library' : 'recent'
  const parent = (event.currentTarget as HTMLElement).parentElement
  parent?.querySelector<HTMLButtonElement>(`#${selected.value}-tab`)?.focus()
}
</script>

<template>
  <section aria-label="Recordings" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-fb-border">
    <header class="flex shrink-0 items-center gap-2 border-b border-fb-border px-3 py-1">
      <div role="tablist" aria-label="Recordings" class="flex min-w-0 flex-1 gap-3" @keydown="navigate">
        <button v-for="tab in tabs" :id="`${tab.id}-tab`" :key="tab.id" type="button" role="tab" :aria-selected="selected === tab.id" :aria-controls="`${tab.id}-panel`" :tabindex="selected === tab.id ? 0 : -1" class="border-b-2 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-fb-primary" :class="selected === tab.id ? 'border-fb-primary text-fb-primary' : 'border-transparent text-fb-muted hover:text-fb-foreground'" @click="selected = tab.id">{{ tab.label }}</button>
      </div>
      <slot name="actions" />
    </header>
    <div v-for="tab in tabs" v-show="selected === tab.id" :id="`${tab.id}-panel`" :key="tab.id" role="tabpanel" :aria-labelledby="`${tab.id}-tab`" class="flex min-h-0 flex-1 flex-col overflow-y-auto" tabindex="0"><slot :name="tab.id" /></div>
  </section>
</template>
