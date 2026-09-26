<template>
  <view class="nav-shell">
    <view class="nav-pill">
      <view class="nav-item" :class="{ active: active === 'library' }" @tap="go('library')"><text class="nav-icon">▦</text><text>书架</text></view>
      <view class="nav-divider"></view>
      <view class="nav-item" :class="{ active: active === 'settings' }" @tap="go('settings')"><text class="nav-icon">◉</text><text>设置</text></view>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({ active: { type: String, default: '' } })
function go(target) {
  if (target === props.active) return
  if (target === 'library') uni.reLaunch({ url: '/pages/library/index' })
  else uni.navigateTo({ url: '/pages/settings/index' })
}
</script>

<style scoped>
.nav-shell { position: fixed; z-index: 12; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; pointer-events: none; padding: 0 18px calc(12px + env(safe-area-inset-bottom)); }
.nav-pill { pointer-events: auto; display: flex; align-items: center; width: 250px; height: 62px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 18px 45px var(--shadow); padding: 6px; }
.nav-item { flex: 1; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--muted); font-size: 13px; font-weight: 600; transition: background .22s ease, color .22s ease, transform .22s ease; }
.nav-item:active { transform: scale(.95); }
.nav-item.active { color: var(--accent); background: var(--accent-soft); }
.nav-icon { font-size: 21px; line-height: 1; }
.nav-divider { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
@media (prefers-reduced-motion: reduce) { .nav-item { transition: none; } }
</style>
