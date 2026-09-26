<template>
  <view class="nav-shell">
    <view class="nav-pill">
      <view class="nav-indicator" :class="{ right: primaryNavigation.active === 'settings' }"></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'library' }" @tap="navigatePrimary('library')"><text class="nav-icon">▦</text><text>书架</text></view>
      <view class="nav-item" :class="{ active: primaryNavigation.active === 'settings' }" @tap="navigatePrimary('settings')"><text class="nav-icon">◉</text><text>设置</text></view>
    </view>
  </view>
</template>

<script setup>
import { onMounted } from 'vue'
import { navigatePrimary, primaryNavigation } from '../src/store/navigation'
const props = defineProps({ active: { type: String, default: '' } })
onMounted(() => { if (props.active && !primaryNavigation.busy) primaryNavigation.active = props.active })
</script>

<style scoped>
.nav-shell { position: fixed; z-index: 12; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; pointer-events: none; padding: 0 18px calc(12px + env(safe-area-inset-bottom)); }
.nav-pill { position: relative; pointer-events: auto; display: flex; align-items: center; width: 250px; height: 62px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 18px 45px var(--shadow); padding: 6px; }
.nav-indicator { position: absolute; left: 6px; top: 6px; bottom: 6px; width: calc(50% - 6px); border-radius: 16px; background: var(--accent-soft); transform: translateX(0); transition: transform .31s cubic-bezier(.22, 1.25, .35, 1); }
.nav-indicator.right { transform: translateX(100%); }
.nav-item { position: relative; z-index: 1; flex: 1; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--muted); font-size: 13px; font-weight: 600; transition: color .24s ease, transform .2s ease; }
.nav-item:active { transform: scale(.95); }
.nav-item.active { color: var(--accent); }
.nav-icon { font-size: 21px; line-height: 1; }
@media (prefers-reduced-motion: reduce) { .nav-indicator, .nav-item { transition: none; } }
</style>
