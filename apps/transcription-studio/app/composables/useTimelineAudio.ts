import { computed, nextTick, onMounted, onScopeDispose, readonly, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { usePlaybackPositionStore } from '~/stores/playbackPosition'
import { useScreenActivity } from './useScreenActivity'
import { usePlaybackResume } from './usePlaybackResume'

interface TimelineAudioOptions {
  audio: Readonly<Ref<HTMLAudioElement | null>>
  source: () => string | undefined
  identity: () => string | undefined
  positionKey: () => string | undefined
}

/** Keep timeline controls and transcript timestamp links on the same media clock. */
export function useTimelineAudio({ audio, source, identity, positionKey }: TimelineAudioOptions) {
  const positions = usePlaybackPositionStore()
  const active = useScreenActivity()
  const currentTime = shallowRef(0)
  const duration = shallowRef(0)
  const playing = shallowRef(false)
  const audioError = shallowRef(false)
  const audioAvailable = computed(() => Boolean(source()) && !audioError.value)
  let frame: number | undefined
  let pendingSeek: number | undefined
  let generation = 0
  let activePositionKey: string | undefined
  let positionReady = false
  let resumePlaying = false
  const resume = usePlaybackResume({
    media: () => audio.value,
    wanted: () => active.value && positionReady && resumePlaying && audioAvailable.value,
    attempt: play,
  })

  function remember() {
    if (activePositionKey && positionReady) positions.remember(activePositionKey, currentTime.value, resumePlaying)
  }
  function flushPosition() { remember(); positions.flush() }

  function stopFrame() {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  function syncTime() {
    // Initial/old-source zero events must not overwrite a saved position before
    // the new media metadata has restored it (including slow audio loads).
    if (!positionReady || pendingSeek !== undefined) return
    const time = audio.value?.currentTime ?? 0
    currentTime.value = Number.isFinite(time) ? time : 0
    remember()
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
    if (positionReady && !resume.pending.value && active.value) resumePlaying = playing.value
    stopFrame()
    syncTime()
    if (playing.value) frame = requestAnimationFrame(animate)
  }

  function fail() {
    resume.stop()
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
    if (!audio.value?.readyState) return
    const value = audio.value?.duration ?? 0
    duration.value = Number.isFinite(value) ? Math.max(0, value) : 0
    if (!positionReady) {
      activePositionKey = positionKey()
      const saved = activePositionKey ? positions.get(activePositionKey) : { seconds: 0, playing: false }
      pendingSeek ??= saved.seconds
      resumePlaying = saved.playing
      positionReady = true
      if (pendingSeek !== undefined) seek(pendingSeek)
      if (saved.playing && active.value) resume.start()
      return
    }
    if (pendingSeek !== undefined) seek(pendingSeek)
  }

  async function play() {
    const element = audio.value
    if (!element || !audioAvailable.value || !active.value) return
    resumePlaying = true
    const requestGeneration = generation
    try {
      await element.play()
    }
    catch (error) {
      // Pausing or switching records can interrupt play() without a media failure.
      if (error instanceof DOMException && error.name === 'AbortError') return
      // Browser autoplay policy is not a broken audio source. Preserve resume
      // intent and the restored position, leaving Play available for a gesture.
      if (error instanceof DOMException && error.name === 'NotAllowedError') { resume.stop(); return }
      if (generation === requestGeneration && audio.value === element) fail()
    }
    finally {
      remember()
    }
  }

  function togglePlayback() {
    const element = audio.value
    if (!element || !audioAvailable.value || !active.value) return
    resume.stop()
    if (!element.paused) { resumePlaying = false; element.pause(); flushPosition(); return }
    return play()
  }

  watch(active, visible => {
    if (!visible) {
      // Preserve playing intent while suspending an inactive screen. Warmup
      // and navigation must never create hidden autoplay or two media clocks.
      flushPosition()
      resume.stop()
      audio.value?.pause()
      stopFrame()
      playing.value = false
    }
    else if (positionReady && resumePlaying) resume.start()
  }, { flush: 'sync' })

  watch([source, identity, positionKey], () => {
    flushPosition()
    positionReady = false
    activePositionKey = undefined
    resume.stop()
    generation++
    audio.value?.pause()
    if (audio.value?.readyState) audio.value.currentTime = 0
    stopFrame()
    pendingSeek = undefined
    currentTime.value = 0
    duration.value = 0
    playing.value = false
    audioError.value = false
    // Benchmark selections can reuse the same already-loaded audio element.
    void nextTick(syncMetadata)
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
      flushPosition()
      positionReady = false
      activePositionKey = undefined
      pendingSeek = undefined
      resume.stop()
      generation++
      for (const [event, listener] of Object.entries(listeners)) element.removeEventListener(event, listener)
      element.pause()
      playing.value = false
      stopFrame()
    })
  }, { flush: 'post' })

  onScopeDispose(() => {
    flushPosition()
    positionReady = false
    generation++
    audio.value?.pause()
    stopFrame()
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flushPosition)
  })

  onMounted(() => window.addEventListener('pagehide', flushPosition))

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
