import { computed, onScopeDispose, readonly, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

interface TimelineAudioOptions {
  audio: Readonly<Ref<HTMLAudioElement | null>>
  source: () => string | undefined
  identity: () => string | undefined
}

/** Keep timeline controls and transcript timestamp links on the same media clock. */
export function useTimelineAudio({ audio, source, identity }: TimelineAudioOptions) {
  const currentTime = shallowRef(0)
  const duration = shallowRef(0)
  const playing = shallowRef(false)
  const audioError = shallowRef(false)
  const audioAvailable = computed(() => Boolean(source()) && !audioError.value)
  let frame: number | undefined
  let pendingSeek: number | undefined
  let generation = 0

  function stopFrame() {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  function syncTime() {
    const time = audio.value?.currentTime ?? 0
    currentTime.value = Number.isFinite(time) ? time : 0
  }

  // timeupdate is intentionally supplemented, not replaced: browsers throttle it
  // too heavily for a smooth playhead, while it still handles background tabs.
  function animate() {
    syncTime()
    frame = playing.value ? requestAnimationFrame(animate) : undefined
  }

  function syncPlayback() {
    const element = audio.value
    playing.value = Boolean(element && !element.paused && !element.ended)
    stopFrame()
    syncTime()
    if (playing.value) frame = requestAnimationFrame(animate)
  }

  function fail() {
    audio.value?.pause()
    audioError.value = true
    playing.value = false
    stopFrame()
  }

  function seek(seconds: number) {
    const element = audio.value
    if (!element || !audioAvailable.value || !Number.isFinite(seconds)) return
    const limit = Number.isFinite(element.duration) ? element.duration : Infinity
    const target = Math.min(Math.max(0, seconds), limit)
    if (element.readyState === 0) {
      pendingSeek = target
      currentTime.value = target
      return
    }
    try {
      element.currentTime = target
      pendingSeek = undefined
      syncTime()
    }
    catch { fail() }
  }

  function syncMetadata() {
    const value = audio.value?.duration ?? 0
    duration.value = Number.isFinite(value) ? Math.max(0, value) : 0
    if (pendingSeek !== undefined) seek(pendingSeek)
  }

  async function togglePlayback() {
    const element = audio.value
    if (!element || !audioAvailable.value) return
    if (!element.paused) {
      element.pause()
      return
    }
    const requestGeneration = generation
    try {
      await element.play()
    }
    catch (error) {
      // Pausing or switching records can interrupt play() without a media failure.
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (generation === requestGeneration && audio.value === element) fail()
    }
  }

  watch([source, identity], () => {
    generation++
    audio.value?.pause()
    if (audio.value?.readyState) audio.value.currentTime = 0
    stopFrame()
    pendingSeek = undefined
    currentTime.value = 0
    duration.value = 0
    playing.value = false
    audioError.value = false
  }, { flush: 'sync' })

  watch(audio, (element, _previous, onCleanup) => {
    if (!element) return
    const listeners = {
      loadedmetadata: syncMetadata,
      durationchange: syncMetadata,
      timeupdate: syncTime,
      seeked: syncTime,
      play: syncPlayback,
      playing: syncPlayback,
      pause: syncPlayback,
      ended: syncPlayback,
      error: fail,
    }
    for (const [event, listener] of Object.entries(listeners)) element.addEventListener(event, listener)
    syncMetadata()
    syncPlayback()
    onCleanup(() => {
      for (const [event, listener] of Object.entries(listeners)) element.removeEventListener(event, listener)
      element.pause()
      playing.value = false
      stopFrame()
    })
  }, { flush: 'post' })

  onScopeDispose(() => {
    generation++
    audio.value?.pause()
    stopFrame()
  })

  return {
    currentTime: readonly(currentTime),
    duration: readonly(duration),
    playing: readonly(playing),
    audioError: readonly(audioError),
    audioAvailable,
    seek,
    togglePlayback,
  }
}
