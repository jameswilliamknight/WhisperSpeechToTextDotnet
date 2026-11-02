import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { LocationSettings, SourceFile, TranscriptionDetail, TranscriptionJob, WorkspacePreferences, WorkspaceSnapshot } from '../../shared/workspace'

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
  const activeJob = computed(() => snapshot.value?.jobs.find(job => job.id === snapshot.value?.activeJobId) ?? null)
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
        const next = await $fetch<WorkspaceSnapshot>('/api/workspace')
        snapshot.value = next
        const selected = next.jobs.find(job => job.id === preferences.value.selectedJobId)
        // Metadata polling must not repeatedly download a private, potentially large transcript.
        if (previous?.status === 'running' && selected && selected.status !== 'running') await loadDetail(selected.id)
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
        if (preferences.value.selectedJobId) await loadDetail(preferences.value.selectedJobId)
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

  async function transcribe(source: File | string): Promise<boolean> {
    error.value = ''
    busy.value = true
    uploading.value = typeof source !== 'string'
    uploadController = new AbortController()
    try {
      const job = typeof source === 'string'
        ? await $fetch<TranscriptionJob>('/api/transcriptions', { method: 'POST', body: { sourceName: source } })
        : await $fetch<TranscriptionJob>(`/api/transcriptions/upload?name=${encodeURIComponent(source.name)}`, {
          method: 'POST', body: source, headers: { 'Content-Type': 'application/octet-stream' }, signal: uploadController.signal,
        })
      await refresh()
      await selectJob(job.id)
      return true
    }
    catch (cause) {
      error.value = uploadController.signal.aborted ? 'Upload cancelled. Refresh history before trying again.' : workspaceError(cause)
      await refresh()
      return false
    }
    finally { busy.value = false; uploading.value = false; uploadController = undefined }
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
    uploading, error, sourceError, activeJob, hydrate, refresh, selectJob, savePreferences, renameSpeaker, loadSources, saveSettings, transcribe, cancel }
})
