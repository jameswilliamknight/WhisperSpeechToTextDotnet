<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiInput from '#layers/freebore-ui/app/components/ui/UiInput.vue'
import UiModalShell from '#layers/freebore-ui/app/components/ui/UiModalShell.vue'
import { speakerNameLimit } from '#shared/speakerNames'

const props = defineProps<{ open: boolean; currentName: string; defaultName: string }>()
const emit = defineEmits<{ close: []; save: [name: string] }>()
const draft = shallowRef('')
const input = useTemplateRef<{ $el: HTMLInputElement }>('input')
const trimmed = computed(() => draft.value.trim())
const tooLong = computed(() => trimmed.value.length > speakerNameLimit)
const canSave = computed(() => !!trimmed.value && !tooLong.value && trimmed.value !== props.currentName)

watch(() => props.open, async (open) => {
  if (!open) return
  draft.value = props.currentName
  await nextTick()
  input.value?.$el.focus()
  input.value?.$el.select()
})

function save() {
  if (canSave.value) emit('save', trimmed.value)
}
</script>

<template>
  <UiModalShell
    :open="open"
    title="Rename speaker"
    title-id="rename-speaker-title"
    capture-escape
    @close="emit('close')"
  >
    <form class="space-y-2" @submit.prevent="save">
      <label for="rename-speaker-input" class="block text-sm font-medium text-fb-foreground">Speaker name</label>
      <UiInput
        id="rename-speaker-input"
        ref="input"
        v-model="draft"
        autocomplete="off"
        :invalid="tooLong"
        aria-describedby="rename-speaker-help"
      />
      <p id="rename-speaker-help" class="text-xs text-fb-foreground-muted">
        Replaces {{ defaultName }} everywhere in this transcript. Source data is unchanged.
      </p>
      <p v-if="tooLong" role="alert" class="text-xs text-fb-danger">Use {{ speakerNameLimit }} characters or fewer.</p>
    </form>
    <template #footer>
      <footer class="flex items-center justify-end gap-3 border-t border-fb-border bg-fb-surface/60 px-4 py-3">
        <UiButton size="sm" @click="emit('close')">Cancel</UiButton>
        <UiButton size="sm" :disabled="!canSave" @click="save">Save name</UiButton>
      </footer>
    </template>
  </UiModalShell>
</template>
