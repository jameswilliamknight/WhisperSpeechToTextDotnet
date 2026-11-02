<script setup lang="ts">
import { onMounted, reactive, shallowRef, watch } from 'vue'
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiInput from '#layers/freebore-ui/app/components/ui/UiInput.vue'
import UiNotice from '#layers/freebore-ui/app/components/ui/UiNotice.vue'
import type { LocationSettings } from '../../../shared/workspace'
import { normaliseDirectoryPath } from '#shared/normaliseDirectoryPath'
import { useWorkspaceStore } from '../../stores/workspace'

const workspace = useWorkspaceStore()
const form = reactive<LocationSettings>({ sourceDirectory: '', workingDirectory: '', outputDirectory: '' })
const validation = shallowRef('')
const saved = shallowRef(false)
const fields = [
  { key: 'sourceDirectory', label: 'Recordings folder (optional)', hint: 'Audio files in this folder appear automatically under Recordings. Leave blank to choose files manually.' },
  { key: 'workingDirectory', label: 'Working directory', hint: 'Private audio copies and processing intermediates.' },
  { key: 'outputDirectory', label: 'Transcript output directory', hint: 'Plain and speaker-labelled transcript files.' },
] as const
watch(() => workspace.snapshot?.settings, settings => { if (settings) Object.assign(form, settings) }, { immediate: true })
watch(form, () => { saved.value = false; validation.value = '' })
onMounted(() => { void workspace.hydrate() })
function pastePath(event: ClipboardEvent, key: keyof LocationSettings) {
  if (!event.clipboardData) return
  event.preventDefault()
  form[key] = normaliseDirectoryPath(event.clipboardData.getData('text/plain'))
}
async function save() {
  validation.value = ''; saved.value = false
  const settings = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, normaliseDirectoryPath(value)])) as unknown as LocationSettings
  Object.assign(form, settings)
  if (!settings.workingDirectory || !settings.outputDirectory) { validation.value = 'Working and output directories are required.'; return }
  if (Object.values(settings).some(value => value && !value.startsWith('/'))) { validation.value = 'Use absolute directory paths beginning with /. Relative paths and ~ are not supported.'; return }
  saved.value = await workspace.saveSettings(settings)
}
</script>

<template>
  <section class="max-w-3xl space-y-5" aria-labelledby="settings-heading">
    <h1 id="settings-heading" class="text-xl font-semibold">Settings</h1>
    <p class="text-sm text-fb-muted">Enter absolute local directory paths, for example /Users/you/Transcriptions. Keep source, working and output directories separate. These are server-local paths, not browser directory selections.</p>
    <p v-if="workspace.loading" role="status" class="text-sm text-fb-muted">Loading settings…</p>
    <UiNotice v-if="workspace.error" tone="danger" title="Settings error">{{ workspace.error }}</UiNotice>
    <form v-if="workspace.snapshot" class="space-y-6 rounded-md border border-fb-border p-6" @submit.prevent="save">
      <div v-for="field in fields" :key="field.key" class="space-y-2"><label :for="field.key" class="block text-sm font-medium">{{ field.label }}</label><UiInput :id="field.key" v-model="form[field.key]" :aria-describedby="`${field.key}-hint`" :disabled="workspace.busy || !!workspace.snapshot.activeJobId" autocomplete="off" spellcheck="false" class="w-full" @paste="pastePath($event, field.key)" @blur="form[field.key] = normaliseDirectoryPath(form[field.key])" /><p :id="`${field.key}-hint`" class="text-xs text-fb-muted">{{ field.hint }}</p></div>
      <p v-if="workspace.snapshot.activeJobId" role="status" class="text-sm text-fb-warning">Locations cannot be changed while a transcription is active.</p>
      <p v-if="validation" role="alert" class="text-sm text-fb-danger">{{ validation }}</p>
      <p v-if="saved" role="status" class="text-sm text-fb-primary">Settings saved.</p>
      <UiButton type="submit" :disabled="workspace.busy || !!workspace.snapshot.activeJobId">{{ workspace.busy ? 'Saving…' : 'Save settings' }}</UiButton>
    </form>
    <UiButton v-else-if="!workspace.loading" @click="workspace.hydrate()">Retry loading settings</UiButton>
  </section>
</template>
