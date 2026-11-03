import { shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

/** Overflow feedback only. Scrolling stays native; no copied turn positions
 * are driven through Vue or a second animation clock. */
export function useTimelineOverflow(viewport: Readonly<Ref<HTMLElement | null>>, canvas: Readonly<Ref<HTMLElement | null>>) {
  const canScrollRight = shallowRef(false)
  watch([viewport, canvas], ([view, content], _, onCleanup) => {
    if (!view || !content) return
    const measure = () => {
      canScrollRight.value = view.scrollWidth - view.clientWidth - view.scrollLeft > 1
    }
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(view)
    view.addEventListener('scroll', measure, { passive: true })
    measure()
    onCleanup(() => { observer.disconnect(); view.removeEventListener('scroll', measure) })
  }, { flush: 'post' })
  return { canScrollRight }
}
