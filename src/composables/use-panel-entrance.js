import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

// The screen slides for 380 ms in App.vue. Start content motion after it has
// reached the viewport, then release data animations after the last card.
export const PANEL_TRAVEL_MS = 420
export const PANEL_REVEAL_MS = 1040
export function usePanelEntrance(active) {
  const phase = ref('idle')
  let travelTimer, revealTimer, revision = 0
  function cancel() { clearTimeout(travelTimer); clearTimeout(revealTimer); revision++ }
  const stop = watch(active, visible => {
    cancel()
    phase.value = visible ? 'waiting' : 'idle'
    if (!visible) return
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
