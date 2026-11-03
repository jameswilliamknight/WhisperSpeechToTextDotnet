import { computed, nextTick, readonly, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

interface TranscriptFollowOptions {
  viewport: Readonly<Ref<HTMLElement | null>>
  passages: () => readonly { start: number; end: number }[]
  position: () => number
  identity: () => string | undefined
  phraseKey?: () => string
}

/** Follow the media clock without ever changing it. Only user scroll intent
 * suspends following; our own smooth-scroll events must not detach the reader. */
export function useTranscriptFollow({ viewport, passages, position, identity, phraseKey }: TranscriptFollowOptions) {
  const following = shallowRef(true)
  const activeIndex = computed(() => {
    const rows = passages()
    const time = position()
    const containing = rows.findIndex(row => row.start <= time && time < row.end)
    if (containing >= 0) return containing
    return rows.findLastIndex(row => row.start <= time)
  })

  function reveal(force = false) {
    const view = viewport.value
    const row = view?.querySelector<HTMLElement>(`[data-passage-index="${activeIndex.value}"]`)
    if (!view || !row) return
    const box = view.getBoundingClientRect()
    // Long uninterrupted speech can form a passage taller than the viewport.
    // Follow its current phrase, not the centre of the entire paragraph.
    const target = row.querySelector<HTMLElement>('[data-playback-highlight]') ?? row
    const bounds = target.getBoundingClientRect()
    if (!force && bounds.top >= box.top + 24 && bounds.bottom <= box.bottom - 24) return
    view.scrollTo({
      top: view.scrollTop + bounds.top - box.top - (view.clientHeight - bounds.height) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  function pause() {
    if (!viewport.value || viewport.value.scrollHeight <= viewport.value.clientHeight) return
    following.value = false
    // Cancel any in-flight follow animation before giving the scroll to the user.
    viewport.value.scrollTo({ top: viewport.value.scrollTop, behavior: 'instant' })
  }
  function onWheel(event: WheelEvent) { if (event.deltaY) pause() }
  function onPointerDown(event: PointerEvent) {
    const view = viewport.value
    if (view && event.clientX >= view.getBoundingClientRect().right - 12) pause()
  }
  function onKeydown(event: KeyboardEvent) {
    const view = viewport.value
    if (!view || event.target !== view || !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    pause()
    // Own these scrolls so Chromium's animated End/PageDown default cannot
    // continue nudging the list after a subsequent explicit timeline seek.
    const targets: Record<string, number> = {
      ArrowUp: view.scrollTop - 40, ArrowDown: view.scrollTop + 40,
      PageUp: view.scrollTop - view.clientHeight, PageDown: view.scrollTop + view.clientHeight,
      Home: 0, End: view.scrollHeight,
    }
    view.scrollTo({ top: targets[event.key], behavior: 'instant' })
  }
  function resume() {
    following.value = true
    // Seeking can update the passage and remove the floating button in the
    // same tick. Measure only after Vue has committed that layout.
    void nextTick(() => { if (following.value) reveal(true) })
  }

  watch(identity, () => {
    following.value = true
    viewport.value?.scrollTo({ top: 0, behavior: 'instant' })
  }, { flush: 'post' })
  watch([activeIndex, viewport, () => phraseKey?.()], () => { if (following.value) reveal() }, { flush: 'post' })

  return { following: readonly(following), activeIndex, resume, onWheel, onPointerDown, onKeydown }
}
