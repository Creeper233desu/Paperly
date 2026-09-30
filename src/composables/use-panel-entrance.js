import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

// Let the new panel paint before revealing its contents. Reveal during page
// travel so the viewport never spends a full slide showing an empty panel.
export const PANEL_TRAVEL_MS = 80
export const PANEL_REVEAL_MS = 1040
export function usePanelEntrance(active, { skip = () => false } = {}) {
  const phase = ref('idle')
  let travelTimer, revealTimer, revision = 0
  function cancel() { clearTimeout(travelTimer); clearTimeout(revealTimer); revision++ }
  const stop = watch(active, visible => {
    cancel()
    phase.value = visible ? 'waiting' : 'idle'
    if (!visible) return
    // Returning from an editor keeps the open book and its shelf in place.
    if (skip()) { phase.value = 'ready'; return }
    const current = revision
    nextTick(() => {
      if (current !== revision) return
      travelTimer = setTimeout(() => {
        if (current !== revision) return
        phase.value = 'entering'
        nextTick(() => {
          if (current !== revision) return
          revealTimer = setTimeout(() => { if (current === revision) phase.value = 'ready' }, PANEL_REVEAL_MS)
        })
      }, PANEL_TRAVEL_MS)
    })
  }, { immediate:true, flush:'sync' })
  onUnmounted(() => { cancel(); stop() })
  return {
    waiting:computed(() => phase.value === 'waiting'),
    entering:computed(() => phase.value === 'entering'),
    ready:computed(() => phase.value === 'ready')
  }
}
