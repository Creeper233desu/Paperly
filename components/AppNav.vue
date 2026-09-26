<template>
  <view class="nav-shell">
    <view class="nav-pill">
      <view class="nav-indicator" :style="{ transform: `translateX(${tabIndex * 100}%)` }"></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'library' }" @tap="navigatePrimary('library')"><text class="nav-icon">▦</text><text>书架</text></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'statistics' }" @tap="navigatePrimary('statistics')"><text class="nav-icon">▥</text><text>统计</text></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'settings' }" @tap="navigatePrimary('settings')"><text class="nav-icon">◉</text><text>设置</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted } from 'vue'
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
</style>
