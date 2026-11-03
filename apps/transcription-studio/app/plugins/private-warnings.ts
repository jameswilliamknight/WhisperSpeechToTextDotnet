/** Vue's default development traces dump component props, which can contain a
 * complete counselling transcript. Keep actionable safe identifiers, not props. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.warnHandler = (message) => {
    const missing = /^Missing required prop: "([\w-]+)"$/.exec(message.trim())
    console.warn(missing ? `[Vue] Missing required prop: ${missing[1]}` : '[Vue] Component warning; details suppressed for transcript privacy.')
  }
})
