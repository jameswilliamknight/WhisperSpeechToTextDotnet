import { onMounted, onScopeDispose } from 'vue'

/** Playback owns Space even on focused buttons; editing and modal handling remain native. */
export function usePlaybackShortcut(available: () => boolean, toggle: () => void | Promise<void>) {
  function handleSpace(event: KeyboardEvent) {
    if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="alertdialog"]')) return
    const input = target?.closest('input')
    // Protect actual value entry, not every input: ranges and toggles are controls,
    // and must not take ownership of the workspace's playback key after a click.
    if (input && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'image', 'hidden'].includes(input.type)) return
    if (document.querySelector('[aria-modal="true"], dialog[open]') || !available()) return
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'keydown') {
      // Space switches to media control, not keyboard navigation. Clear the old
      // control's focus so :focus, :focus-visible, and focus-within decorations
      // cannot light up anywhere (including shared-layer components).
      const focused = document.activeElement
      if (focused instanceof HTMLElement || focused instanceof SVGElement) focused.blur()
      if (!event.repeat) void toggle()
    }
  }
  // Capture both phases of the key: native buttons activate on keyup.
  onMounted(() => {
    window.addEventListener('keydown', handleSpace, true)
    window.addEventListener('keyup', handleSpace, true)
  })
  onScopeDispose(() => {
    window.removeEventListener('keydown', handleSpace, true)
    window.removeEventListener('keyup', handleSpace, true)
  })
}
