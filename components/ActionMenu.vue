<template>
  <view v-if="visible" class="menu-backdrop" @tap="$emit('close')">
    <view class="menu-panel" @tap.stop>
      <view class="menu-grabber"></view>
      <view class="menu-heading"><view v-if="title" class="menu-title">{{ title }}</view><view class="menu-close" @tap="$emit('close')">×</view></view>
      <view v-for="(item, index) in items" :key="index" class="menu-row" :class="{ danger: item.danger }" @tap="$emit('select', index)"><text>{{ item.label }}</text><text class="menu-arrow">↗</text></view>
    </view>
  </view>
</template>

<script setup>
defineProps({ visible: Boolean, title: String, items: { type: Array, default: () => [] } })
defineEmits(['select', 'close'])
</script>

<style scoped>
.menu-backdrop { position: fixed; z-index: 50; inset: 0; background: rgba(10, 13, 20, .36); display: flex; align-items: flex-end; justify-content: center; padding: 14px; animation: fade .2s ease both; }
.menu-panel { width: 100%; max-width: 500px; background: var(--surface); border: 1px solid var(--line); border-radius: 27px; padding: 10px 15px 17px; box-shadow: 0 28px 80px rgba(0,0,0,.2); animation: rise .27s cubic-bezier(.2,.75,.25,1) both; }
.menu-grabber { width: 34px; height: 4px; border-radius: 4px; background: var(--line); margin: 3px auto 11px; }
.menu-heading { display: flex; align-items: center; justify-content: space-between; padding: 2px 7px 12px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.menu-title { color: var(--muted); font-size: 13px; }
.menu-close { width: 30px; height: 30px; line-height: 27px; text-align: center; border-radius: 50%; color: var(--muted); background: var(--surface-alt); font-size: 21px; }
.menu-row { min-height: 62px; padding: 0 15px; display: flex; align-items: center; justify-content: space-between; font-size: 15px; color: var(--text); border-radius: 14px; transition: background .15s ease, transform .15s ease; }
.menu-row:active { background: var(--surface-alt); }
.menu-row.danger { color: var(--danger); }
.menu-arrow { color: var(--muted); font-size: 18px; }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
@media (min-width: 900px) { .menu-backdrop { align-items: center; }.menu-panel { animation-name: pop; }.menu-grabber { display: none; } @keyframes pop { from { opacity: 0; transform: scale(.96) translateY(10px); } } }
@media (prefers-reduced-motion: reduce) { .menu-backdrop, .menu-panel { animation: none; } }
</style>
