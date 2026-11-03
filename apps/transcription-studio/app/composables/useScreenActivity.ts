import { inject, shallowRef } from 'vue'
import type { InjectionKey, Ref } from 'vue'

export const screenActivityKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('studio-screen-active')

/** Cached screens stay mounted, but only the visible screen may own media or
 * global shortcuts. A standalone review remains active outside the screen host. */
export function useScreenActivity() {
  return inject(screenActivityKey, () => shallowRef(true), true)
}
