<script setup lang="ts">
import UiButton from '#layers/freebore-ui/app/components/ui/UiButton.vue'
import UiNotice from '#layers/freebore-ui/app/components/ui/UiNotice.vue'
import { useStudio } from '../../composables/useStudio'
import BackendPicker from './BackendPicker.vue'
import BenchmarkSummary from './BenchmarkSummary.vue'
import RunsComparison from './RunsComparison.vue'
import SourceStatus from './SourceStatus.vue'
import TranscriptReview from './TranscriptReview.vue'

const { snapshot, loading, busy, error, now, selectedRun, activeRun, selectRun, refresh, start, cancel, renameSpeaker } = useStudio()

function saveSpeakerName(input: { speakerId: string; name: string }) {
  if (selectedRun.value) void renameSpeaker(selectedRun.value.id, input)
}
</script>

<template>
  <div class="min-h-screen bg-fb-canvas text-fb-foreground">
    <header class="border-b border-fb-border bg-fb-surface-muted/20">
      <div class="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <h1 class="text-lg font-semibold tracking-tight">Transcription Studio</h1>
        <UiButton size="sm" class="cursor-default" :disabled="loading" @click="refresh">Refresh</UiButton>
      </div>
    </header>
    <main class="mx-auto max-w-screen-2xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
      <UiNotice v-if="error" tone="danger" title="Studio connection">{{ error }}</UiNotice>
      <div v-if="loading && !snapshot" role="status" class="rounded-md border border-fb-border p-10 text-center text-sm text-fb-muted">Connecting to the local studio…</div>
      <template v-if="snapshot">
        <div class="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <SourceStatus :source="snapshot.source" />
          <BackendPicker :backends="snapshot.backends" :prepared="snapshot.source.prepared" :busy="busy" :running="!!snapshot.activeRunId" @start="start" @cancel="cancel" />
        </div>
        <div v-if="snapshot.activeRunId" role="status" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-fb-primary-border/50 bg-fb-primary-soft/20 px-5 py-4 text-sm">
          <p class="text-fb-primary"><span class="font-medium capitalize">{{ activeRun?.backend ?? 'Backend' }}</span>: {{ activeRun?.phase ?? 'Running' }}</p>
        </div>
        <BenchmarkSummary :runs="snapshot.runs" />
        <RunsComparison :runs="snapshot.runs" :selected-id="selectedRun?.id" :now="now" @select="selectRun" />
        <TranscriptReview :run="selectedRun" :audio-available="snapshot.source.prepared" @rename-speaker="saveSpeakerName" />
      </template>
    </main>
  </div>
</template>
