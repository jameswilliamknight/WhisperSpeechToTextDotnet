import { computed, onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import type { BackendId, BenchmarkRun, RunPreset, StudioSnapshot } from '../../shared/studio'

export function useStudio() {
  // Client-only fetches keep private transcripts out of SSR payloads and page source.
  const snapshot = shallowRef<StudioSnapshot | null>(null)
  const selectedId = shallowRef<string | null>(null)
  const loading = shallowRef(true)
  const busy = shallowRef(false)
  const error = shallowRef('')
  const now = shallowRef(Date.now())
  const selectedRun = computed(() => snapshot.value?.runs.find(run => run.id === selectedId.value) ?? null)
  const activeRun = computed(() => snapshot.value?.runs.find(run => run.id === snapshot.value?.activeRunId) ?? null)
  let disposed = false
  let fetching = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let clock: ReturnType<typeof setInterval> | undefined
  const controller = new AbortController()

  async function refresh() {
    if (fetching || disposed) return
    fetching = true
    try {
      const data = await $fetch<StudioSnapshot>('/api/studio', { signal: controller.signal })
      if (disposed) return
      snapshot.value = data
      if (!data.runs.some(run => run.id === selectedId.value)) {
        selectedId.value = data.activeRunId ?? data.runs[0]?.id ?? null
      }
      error.value = ''
    } catch {
      // API diagnostics can include local filenames; never surface raw errors here.
      if (!disposed) error.value = 'Could not refresh the studio. Check the local service and try again.'
    } finally {
      loading.value = false
      fetching = false
      clearTimeout(timer)
      if (!disposed && snapshot.value?.activeRunId) timer = setTimeout(refresh, 1500)
    }
  }

  async function start(backend: BackendId, preset: RunPreset) {
    if (busy.value || snapshot.value?.activeRunId) return
    busy.value = true
    error.value = ''
    try {
      const run = await $fetch<BenchmarkRun>('/api/runs', {
        method: 'POST', body: { backend, preset }, signal: controller.signal,
      })
      if (disposed) return
      selectedId.value = run.id
      if (snapshot.value) snapshot.value = {
        ...snapshot.value, activeRunId: run.id,
        runs: [run, ...snapshot.value.runs.filter(item => item.id !== run.id)],
      }
      await refresh()
    } catch {
      if (!disposed) error.value = 'The run could not start. Check backend availability and try again.'
    } finally {
      busy.value = false
    }
  }

  function updateRun(runId: string, update: Partial<BenchmarkRun>) {
    if (!snapshot.value) return
    snapshot.value = {
      ...snapshot.value,
      runs: snapshot.value.runs.map(run => run.id === runId ? { ...run, ...update } : run),
    }
  }

  async function renameSpeaker(runId: string, input: { speakerId: string; name: string }): Promise<boolean> {
    const current = snapshot.value?.runs.find(run => run.id === runId)
    if (!current?.result) return false
    const previous = current.speakerNames
    const speakerNames = { ...previous, [input.speakerId]: input.name }
    updateRun(runId, { speakerNames })
    try {
      const saved = await $fetch<Record<string, string>>(`/api/runs/${encodeURIComponent(runId)}/speakers`, {
        method: 'PUT', body: { speakerNames },
      })
      updateRun(runId, { speakerNames: saved })
      return true
    }
    catch {
      updateRun(runId, { speakerNames: previous })
      if (!disposed) error.value = 'Speaker name could not be saved. Check the local service and try again.'
      return false
    }
  }

  async function cancel() {
    const id = snapshot.value?.activeRunId
    if (!id || busy.value) return
    busy.value = true
    try {
      await $fetch(`/api/runs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST', body: {}, signal: controller.signal,
      })
      await refresh()
    } catch {
      if (!disposed) error.value = 'Cancellation could not be confirmed. Refresh before starting another run.'
    } finally {
      busy.value = false
    }
  }

  onMounted(() => {
    void refresh()
    clock = setInterval(() => { if (snapshot.value?.activeRunId) now.value = Date.now() }, 1000)
  })
  onUnmounted(() => {
    disposed = true
    controller.abort()
    clearTimeout(timer)
    clearInterval(clock)
  })

  return {
    snapshot: readonly(snapshot), loading: readonly(loading), busy: readonly(busy),
    error: readonly(error), now: readonly(now), selectedRun, activeRun,
    selectRun: (id: string) => { selectedId.value = id }, refresh, start, cancel, renameSpeaker,
  }
}
