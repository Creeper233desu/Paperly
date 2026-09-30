import { onUnmounted, ref, watch } from 'vue'

// Toggle a class without remounting a panel or losing its scroll position.
export function usePanelEntrance(active, duration = 1280) {
  const entering = ref(false)
  let timer
  const stop = watch(active, visible => {
    clearTimeout(timer)
    entering.value = !!visible
    if (visible) timer = setTimeout(() => { entering.value = false }, duration)
  }, { immediate:true, flush:'sync' })
  onUnmounted(() => { clearTimeout(timer); stop() })
  return entering
}
