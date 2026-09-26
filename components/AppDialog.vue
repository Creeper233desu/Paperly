<template>
  <view v-if="visible" class="dialog-backdrop" @tap="$emit('cancel')"><view class="dialog-box" @tap.stop><view class="dialog-heading">{{ title }}</view><view v-if="message" class="dialog-message">{{ message }}</view><slot></slot><view class="dialog-buttons"><view class="dialog-cancel" @tap="$emit('cancel')">取消</view><view class="dialog-confirm" :class="{ danger: destructive }" @tap="$emit('confirm')">{{ confirmText }}</view></view></view></view>
</template>
<script setup>
defineProps({ visible: Boolean, title: String, message: String, confirmText: { type: String, default: '确定' }, destructive: Boolean })
defineEmits(['cancel', 'confirm'])
</script>
<style scoped>
.dialog-backdrop { position: fixed; z-index: 60; inset: 0; background: rgba(10,13,20,.5); display: flex; align-items: center; justify-content: center; padding: 18px; animation: fade .2s ease both; }
.dialog-box { width: 100%; max-width: 450px; background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 26px; padding: 28px; box-shadow: 0 26px 80px rgba(0,0,0,.2); animation: pop .24s ease both; }
.dialog-heading { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
.dialog-message { color: var(--muted); font-size: 14px; line-height: 1.65; margin-bottom: 18px; }
.dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 23px; }
.dialog-cancel, .dialog-confirm { min-width: 82px; text-align: center; padding: 12px 16px; border-radius: 13px; font-size: 14px; font-weight: 600; }
.dialog-cancel { background: var(--surface-alt); color: var(--muted); }.dialog-confirm { background: var(--accent); color: #fff; }.dialog-confirm.danger { background: var(--danger); }
@keyframes fade { from { opacity: 0; } } @keyframes pop { from { opacity: 0; transform: scale(.96) translateY(12px); } }
@media (prefers-reduced-motion: reduce) { .dialog-backdrop, .dialog-box { animation: none; } }
</style>
