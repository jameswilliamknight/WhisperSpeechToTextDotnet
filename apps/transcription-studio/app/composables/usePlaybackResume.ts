import { onScopeDispose, readonly, shallowRef } from 'vue'

interface PlaybackResumeOptions {
  media: () => HTMLAudioElement | null
  wanted: () => boolean
  attempt: () => Promise<void>
}

/** A fulfilled play() is not proof that startup playback survived. Verify actual
 * clock advancement for a bounded three-second window; never create an idle poll
 * or issue concurrent play requests. The caller stops on policy/media errors. */
export function usePlaybackResume({ media, wanted, attempt }: PlaybackResumeOptions) {
  const pending = shallowRef(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  function stop() {
    generation++
    pending.value = false
    clearTimeout(timer)
    timer = undefined
  }

  function start() {
    stop()
    if (!wanted() || !media()) return
    pending.value = true
    const token = generation
    const initialTime = media()!.currentTime
    let checks = 0, inFlight = false
    function check() {
      const element = media()
      if (token !== generation) return
      if (!element || !wanted() || checks++ >= 12
        || (!element.paused && !element.seeking && element.currentTime > initialTime + 0.02)) { stop(); return }
      if (element.paused && !inFlight) {
        inFlight = true
        void attempt().finally(() => { inFlight = false })
      }
      if (token === generation) timer = setTimeout(check, 250)
    }
    check()
  }

  onScopeDispose(stop)
  return { pending: readonly(pending), start, stop }
}
