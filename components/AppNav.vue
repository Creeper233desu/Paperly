<template>
  <view class="nav-shell">
    <view class="nav-pill" role="tablist" aria-label="主导航">
      <view class="nav-indicator" :style="{ transform: `translateX(${tabIndex * 100}%)` }"></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'library' }" role="tab" :aria-selected="primaryNavigation.active === 'library'" aria-label="书架" @tap="navigatePrimary('library')"><UiIcon name="shelf" /><text>书架</text></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'statistics' }" role="tab" :aria-selected="primaryNavigation.active === 'statistics'" aria-label="统计" @tap="navigatePrimary('statistics')"><UiIcon name="chart" /><text>统计</text></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'settings' }" role="tab" :aria-selected="primaryNavigation.active === 'settings'" aria-label="设置" @tap="navigatePrimary('settings')"><UiIcon name="sliders" /><text>设置</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import UiIcon from './UiIcon.vue'
import { navigatePrimary, PRIMARY_TABS, primaryNavigation } from '../src/store/navigation'
const props = defineProps({ active: { type: String, default: '' } })
const tabIndex = computed(() => Math.max(0, PRIMARY_TABS.indexOf(primaryNavigation.active)))
onMounted(() => { if (props.active && !primaryNavigation.busy) primaryNavigation.active = props.active })
</script>

<style scoped>
.nav-shell { position: fixed; z-index: 12; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; pointer-events: none; padding: 0 18px calc(12px + env(safe-area-inset-bottom)); }
.nav-pill { position: relative; pointer-events: auto; display: flex; align-items: center; width: 330px; max-width: calc(100vw - 36px); height: 62px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 18px 45px var(--shadow); padding: 6px; }
.nav-indicator { position: absolute; left: 6px; top: 6px; bottom: 6px; width: calc((100% - 12px) / 3); border-radius: 16px; background: var(--accent-soft); transition: transform .34s cubic-bezier(.22, .9, .27, 1); }
.nav-item { position: relative; z-index: 1; flex: 1; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--muted); font-size: 13px; font-weight: 600; transition: color .24s ease, transform .2s ease; }
.nav-item:active { transform: scale(.95); }
.nav-item.active { color: var(--accent); }
.nav-icon { font-size: 21px; line-height: 1; }
@media (max-width: 390px) { .nav-pill { width: 300px; }.nav-item { gap: 5px; font-size: 12px; }.nav-icon { font-size: 18px; } }
@media (prefers-reduced-motion: reduce) { .nav-indicator, .nav-item { transition: none; } }
.nav-pill { height:64px; border-radius:24px; box-shadow:0 8px 30px var(--shadow),inset 0 1px 0 rgba(255,255,255,.08); }.nav-item { gap:8px; font-size:12px; }.nav-item :deep(.ui-icon) { transition:transform .34s cubic-bezier(.2,.8,.2,1); }.nav-item.active :deep(.ui-icon) { transform:translateY(-1px); }.nav-indicator { border-radius:18px; box-shadow:0 2px 8px var(--shadow); transition:transform .38s cubic-bezier(.22,.82,.22,1); }
@media(prefers-reduced-motion:reduce) { .nav-item :deep(.ui-icon),.nav-indicator { transition:none; } }
</style>
