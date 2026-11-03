import { onMounted, onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { useScreenActivity } from './useScreenActivity'

interface TimelineFollowOptions {
  viewport: Readonly<Ref<HTMLElement | null>>
  canvas: Readonly<Ref<HTMLElement | null>>
  leadingOverlay?: Readonly<Ref<HTMLElement | null>>
  expanded: Readonly<Ref<boolean>>
  position: Readonly<Ref<number>>
  duration: Readonly<Ref<number>>
}

/** Follow the media clock, except while the user owns the seek gesture. */
export function useTimelineFollow({ viewport, canvas, leadingOverlay, expanded, position, duration }: TimelineFollowOptions) {
  const dragging = shallowRef(false)
  const active = useScreenActivity()
  let observer: ResizeObserver | undefined
  let panFrame: number | undefined
  let fractionalShift = 0

  // Some browser/display combinations round scrollLeft to device pixels. Keep
  // native scrolling and translate only its discarded fraction: no smoothing
  // lag, extra media clock, or competing FLIP animation. Independent translate
  // also composes with AutoAnimate's transform during expand/collapse.
  function scrollTo(target: number) {
    const view = viewport.value, content = canvas.value
    if (!view || !content) return
    view.scrollLeft = target
    fractionalShift = view.scrollLeft - target
    content.style.translate = `${fractionalShift}px 0`
  }

  function targetScroll() {
    const view = viewport.value
    const content = canvas.value
    if (!view || !content) return 0
    if (!expanded.value) return 0
    // Measure the actual seek rail so the label gutter and animated width are
    // accounted for. Browser clamping lets the playhead move at either end.
    const rail = content.querySelector<HTMLInputElement>('input[type="range"]')
    if (!rail) return 0
    const railBox = rail.getBoundingClientRect()
    // Include the viewport's padded rail origin. Canvas-local coordinates miss
    // that gutter and leave the playhead consistently off-centre by 8px.
    const x = view.scrollLeft + railBox.left - fractionalShift - view.getBoundingClientRect().left + railBox.width * position.value / duration.value
    // A wider viewport reveals the *same* turns beneath the fixed label gutter.
    // Centre playback in the usable rail, not behind those non-interactive labels.
    const covered = Math.max(0, (leadingOverlay?.value?.getBoundingClientRect().right ?? view.getBoundingClientRect().left) - view.getBoundingClientRect().left)
    return Math.max(0, Math.min(view.scrollWidth - view.clientWidth, x - (view.clientWidth + covered) / 2))
  }

  function center() {
    if (!active.value || dragging.value || panFrame !== undefined || !viewport.value?.isConnected) return
    scrollTo(targetScroll())
  }

  function cancelPan() {
    if (panFrame !== undefined) cancelAnimationFrame(panFrame)
    panFrame = undefined
  }

  function animateCenter() {
    cancelPan()
    const view = viewport.value
    if (!view) return
    if (!expanded.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      center()
      return
    }
    const from = view.scrollLeft - fractionalShift
    const started = performance.now()
    // Own the scroll during release easing so media-clock updates cannot snap
    // over the animation. Recompute the destination as playback continues.
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - started) / 300)
      const eased = 1 - (1 - fraction) ** 3
      scrollTo(from + (targetScroll() - from) * eased)
      panFrame = fraction < 1 ? requestAnimationFrame(tick) : undefined
    }
    panFrame = requestAnimationFrame(tick)
  }

  function startDrag(event: PointerEvent) {
    cancelPan()
    dragging.value = true
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
  }

  function finishDrag() {
    if (!dragging.value) return
    dragging.value = false
    animateCenter()
  }

  watch([position, expanded], center, { flush: 'post' })
  onMounted(() => {
    // AutoAnimate changes canvas geometry over several frames; follow those
    // measurements rather than centering against the final width too early.
    observer = new ResizeObserver(center)
    if (canvas.value) observer.observe(canvas.value)
    if (viewport.value) observer.observe(viewport.value)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    window.addEventListener('blur', finishDrag)
  })
  onScopeDispose(() => {
    observer?.disconnect()
    cancelPan()
    if (typeof window === 'undefined') return
    window.removeEventListener('pointerup', finishDrag)
    window.removeEventListener('pointercancel', finishDrag)
    window.removeEventListener('blur', finishDrag)
  })

  return { startDrag, finishDrag }
}
