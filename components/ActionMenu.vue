<template>
  <view v-if="visible" class="menu-backdrop" @tap.self="$emit('close')">
    <view class="menu-panel">
      <view v-if="title" class="menu-title">{{ title }}</view>
      <view v-for="(item, index) in items" :key="index" class="menu-row" :class="{ danger: item.danger }" @tap="$emit('select', index)"><text>{{ item.label }}</text><text class="menu-arrow">›</text></view>
      <view class="menu-cancel" @tap="$emit('close')">取消</view>
    </view>
  </view>
</template>

<script setup>
defineProps({ visible: Boolean, title: String, items: { type: Array, default: () => [] } })
defineEmits(['select', 'close'])
</script>

<style scoped>
.menu-backdrop { position: fixed; z-index: 50; inset: 0; background: rgba(10, 13, 20, .42); display: flex; align-items: flex-end; justify-content: center; padding: 18px; animation: fade .2s ease both; }
.menu-panel { width: 100%; max-width: 520px; background: var(--surface); border: 1px solid var(--line); border-radius: 26px; padding: 12px; box-shadow: 0 28px 80px rgba(0,0,0,.22); animation: rise .26s cubic-bezier(.2,.75,.25,1) both; }
.menu-title { color: var(--muted); font-size: 13px; padding: 12px 12px 17px; }
.menu-row { min-height: 55px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; font-size: 15px; color: var(--text); border-radius: 14px; transition: background .15s ease; }
.menu-row:active { background: var(--surface-alt); }
.menu-row.danger { color: var(--danger); }
.menu-arrow { color: var(--muted); font-size: 23px; }
.menu-cancel { margin-top: 7px; border-top: 1px solid var(--line); text-align: center; color: var(--muted); padding: 17px; font-size: 14px; }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
@media (min-width: 900px) { .menu-backdrop { align-items: center; } .menu-panel { animation-name: pop; } @keyframes pop { from { opacity: 0; transform: scale(.96) translateY(10px); } } }
@media (prefers-reduced-motion: reduce) { .menu-backdrop, .menu-panel { animation: none; } }
</style>
