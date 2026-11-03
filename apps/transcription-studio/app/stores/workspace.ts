import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { LocationSettings, SourceFile, TranscriptionDetail, TranscriptionJob, WorkspacePreferences, WorkspaceSnapshot } from '#shared/workspace'
import { recordingRows, successfulFallback } from '#shared/recordingRows'

export function workspaceError(cause: unknown): string {
  const error = cause as { data?: { statusMessage?: string; message?: string }; message?: string }
  return error?.data?.statusMessage ?? error?.data?.message ?? error?.message ?? 'The local workspace request failed.'
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const snapshot = shallowRef<WorkspaceSnapshot | null>(null)
  const preferences = shallowRef<WorkspacePreferences>({ selectedJobId: null, copyWithSpeakers: true })
  const detail = shallowRef<TranscriptionDetail | null>(null)
  const sourceFiles = shallowRef<SourceFile[]>([])
  const hydrated = shallowRef(false)
  const loading = shallowRef(false)
  const detailLoading = shallowRef(false)
  const sourcesLoading = shallowRef(false)
  const busy = shallowRef(false)
  const uploading = shallowRef(false)
  const error = shallowRef('')
  const sourceError = shallowRef('')
  const sourceReconnecting = shallowRef(false)
  const retryRequestedId = shallowRef<string | null>(null)
  const reviewPendingId = shallowRef<string | null>(null)
  const activeJob = computed(() => snapshot.value?.jobs.find(job => job.id === snapshot.value?.activeJobId) ?? null)
  const progressJob = computed(() => activeJob.value ?? snapshot.value?.jobs.find(job => job.id === reviewPendingId.value) ?? null)
  let hydration: Promise<void> | undefined
  let refreshRequest: Promise<void> | undefined
  let preferenceQueue = Promise.resolve()
  let uploadController: AbortController | undefined
  let sourcesController: AbortController | undefined

  async function loadDetail(id: string) {
    detailLoading.value = true
    try {
      const result = await $fetch<TranscriptionDetail>(`/api/transcriptions/${encodeURIComponent(id)}`)
      if (preferences.value.selectedJobId === id) detail.value = result
    }
    catch (cause) { error.value = workspaceError(cause) }
    finally { if (preferences.value.selectedJobId === id) detailLoading.value = false }
  }

  function refresh(): Promise<void> {
    if (refreshRequest) return refreshRequest
    refreshRequest = (async () => {
      try {
        const previous = snapshot.value?.jobs.find(job => job.id === preferences.value.selectedJobId)
        const previousActiveId = snapshot.value?.activeJobId
        const next = await $fetch<WorkspaceSnapshot>('/api/workspace')
        snapshot.value = next
        const finished = next.jobs.find(job => job.id === previousActiveId)
        if (finished?.status === 'succeeded') reviewPendingId.value = finished.id
        const selected = next.jobs.find(job => job.id === preferences.value.selectedJobId)
        // Metadata polling must not repeatedly download a private, potentially large transcript.
        if (previous?.status === 'running' && selected && selected.status !== 'running') {
          const fallback = successfulFallback(next.jobs, selected)
          if (fallback) await selectJob(fallback.id)
          else await loadDetail(selected.id)
        }
      }
      catch (cause) { error.value = workspaceError(cause) }
      finally { refreshRequest = undefined }
    })()
    return refreshRequest
  }

  function hydrate(): Promise<void> {
    if (!import.meta.client || hydrated.value) return Promise.resolve()
    if (hydration) return hydration
    loading.value = true
    error.value = ''
    hydration = (async () => {
      try {
        snapshot.value = await $fetch<WorkspaceSnapshot>('/api/workspace')
        preferences.value = snapshot.value.preferences
        hydrated.value = true
        if (preferences.value.selectedJobId) {
          const selected = preferences.value.selectedJobId
          const row = recordingRows([], snapshot.value.jobs).find(row => row.jobIds.includes(selected))
          const current = row?.latest?.status === 'running' ? row.latest : row?.transcript ?? row?.latest
          if (current && current.id !== selected) await selectJob(current.id)
          else await loadDetail(selected)
        }
      }
      catch (cause) { error.value = workspaceError(cause) }
      finally { loading.value = false; hydration = undefined }
    })()
    return hydration
  }

  function savePreferences(update: Partial<WorkspacePreferences>) {
    preferences.value = { ...preferences.value, ...update }
    const desired = { ...preferences.value }
    // Serialize writes so rapid history selections cannot persist an older selection last.
    preferenceQueue = preferenceQueue.then(async () => {
      try { await $fetch<WorkspacePreferences>('/api/workspace/preferences', { method: 'PUT', body: desired }) }
      catch (cause) { error.value = workspaceError(cause) }
    })
    return preferenceQueue
  }

  async function selectJob(id: string) {
    error.value = ''
    detail.value = null
    const saved = savePreferences({ selectedJobId: id })
    await Promise.all([saved, loadDetail(id)])
  }

  async function renameSpeaker(input: { speakerId: string; name: string }): Promise<boolean> {
    const current = detail.value
    if (!current?.result) return false
    const previous = current.speakerNames ?? {}
    const speakerNames = { ...previous, [input.speakerId]: input.name }
    // Optimistic labels keep the modal interaction immediate; roll back if persistence fails.
    detail.value = { ...current, speakerNames }
    try {
      const saved = await $fetch<Record<string, string>>(`/api/transcriptions/${encodeURIComponent(current.id)}/speakers`, {
        method: 'PUT', body: { speakerNames },
      })
      if (detail.value?.id === current.id) detail.value = { ...detail.value, speakerNames: saved }
      return true
    }
    catch (cause) {
      if (detail.value?.id === current.id) detail.value = { ...detail.value, speakerNames: previous }
      error.value = workspaceError(cause)
      return false
    }
  }

  async function loadSources(signal?: AbortSignal) {
    sourcesController?.abort()
    const controller = new AbortController()
    sourcesController = controller
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    sourcesLoading.value = true
    sourceError.value = ''
    try {
      const result = await $fetch<{ files: SourceFile[] }>('/api/source-files', { signal: controller.signal })
      if (!controller.signal.aborted) sourceFiles.value = result.files
    }
    catch (cause) {
      if (!controller.signal.aborted) { sourceFiles.value = []; sourceError.value = workspaceError(cause) }
    }
    finally {
      signal?.removeEventListener('abort', abort)
      if (sourcesController === controller) { sourcesLoading.value = false; sourcesController = undefined }
    }
  }

  async function saveSettings(settings: LocationSettings): Promise<boolean> {
    error.value = ''
    busy.value = true
    try {
      const saved = await $fetch<LocationSettings>('/api/workspace/settings', { method: 'PUT', body: settings })
      sourcesController?.abort()
      if (snapshot.value) snapshot.value = { ...snapshot.value, settings: saved }
      sourceFiles.value = []
      return true
    }
    catch (cause) { error.value = workspaceError(cause); return false }
    finally { busy.value = false }
  }

  async function startJob(request: () => Promise<TranscriptionJob>, upload = false): Promise<boolean> {
    if (busy.value || snapshot.value?.activeJobId) return false
    error.value = ''
    reviewPendingId.value = null
    busy.value = true
    uploading.value = upload
    uploadController = new AbortController()
    try {
      const job = await request()
      await refresh()
      await selectJob(job.id)
      // A short clip can finish before the initial metadata round-trip; it still
      // needs the same explicit completion acknowledgement as a longer job.
      if (detail.value?.id === job.id && detail.value.status === 'succeeded') reviewPendingId.value = job.id
      else {
        const terminal = snapshot.value?.jobs.find(item => item.id === job.id)
        const fallback = terminal && successfulFallback(snapshot.value?.jobs ?? [], terminal)
        if (fallback) await selectJob(fallback.id)
      }
      return true
    }
    catch (cause) {
      const duplicate = (cause as { data?: { data?: { retryJobId?: unknown } } })?.data?.data?.retryJobId
      if (typeof duplicate === 'string') retryRequestedId.value = duplicate
      else error.value = uploadController.signal.aborted ? 'Upload cancelled. Refresh recordings before trying again.' : workspaceError(cause)
      await refresh()
      return false
    }
    finally { busy.value = false; uploading.value = false; uploadController = undefined }
  }

  function transcribe(source: File | string): Promise<boolean> {
    return startJob(() => typeof source === 'string'
      ? $fetch<TranscriptionJob>('/api/transcriptions', { method: 'POST', body: { sourceName: source } })
      : $fetch<TranscriptionJob>(`/api/transcriptions/upload?name=${encodeURIComponent(source.name)}`, {
        method: 'POST', body: source, headers: { 'Content-Type': 'application/octet-stream' }, signal: uploadController?.signal,
      }), typeof source !== 'string')
  }
  function retry(id: string): Promise<boolean> {
    return startJob(() => $fetch<TranscriptionJob>(`/api/transcriptions/${encodeURIComponent(id)}/retry`, { method: 'POST', body: {} }))
  }
  function requestRetry(id: string | null) { retryRequestedId.value = id }
  async function acknowledgeCompletion() {
    const id = reviewPendingId.value
    if (!id) return
    if (detail.value?.id === id && detail.value.result) { reviewPendingId.value = null; return }
    await selectJob(id)
    if (detail.value?.id === id && detail.value.result) reviewPendingId.value = null
  }

  async function cancel() {
    error.value = ''
    if (uploading.value) { uploadController?.abort(); return }
    const id = snapshot.value?.activeJobId
    if (!id) return
    try {
      await $fetch(`/api/transcriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} })
      await refresh()
    }
    catch (cause) { error.value = workspaceError(cause) }
  }

  return { snapshot, preferences, detail, sourceFiles, hydrated, loading, detailLoading, sourcesLoading, busy,
    uploading, error, sourceError, sourceReconnecting, activeJob, progressJob, reviewPendingId, acknowledgeCompletion, retryRequestedId, requestRetry, retry, hydrate, refresh, selectJob, savePreferences, renameSpeaker, loadSources, saveSettings, transcribe, cancel }
})
