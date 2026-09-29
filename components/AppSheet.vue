<template><view v-if="mounted" class="sheet-mask" :class="{ shown }" @tap="close"><view class="sheet-panel" @tap.stop><view class="sheet-header"><view><view class="sheet-title">{{ title }}</view><text v-if="subtitle" class="sheet-subtitle">{{ subtitle }}</text></view><view class="sheet-close" role="button" aria-label="关闭" @tap="close"><UiIcon name="close" /></view></view><view class="sheet-body"><slot></slot></view><view v-if="$slots.footer" class="sheet-footer"><slot name="footer"></slot></view></view></view></template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import UiIcon from './UiIcon.vue'
const props = defineProps({ visible: Boolean, title: String, subtitle: String })
const emit = defineEmits(['close'])
const mounted = ref(false), shown = ref(false)
let timer, frame
watch(() => props.visible, visible => {
  clearTimeout(timer); clearTimeout(frame)
  if (visible) { mounted.value = true; frame = setTimeout(() => { shown.value = true }, 20) }
  else { shown.value = false; timer = setTimeout(() => { mounted.value = false }, 240) }
}, { immediate: true })
function close() { emit('close') }
onBeforeUnmount(() => { clearTimeout(timer); clearTimeout(frame) })
</script>
<style scoped>
.sheet-mask { position:fixed; z-index:65; inset:0; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(12,18,28,0); transition:background .24s ease; }.sheet-mask.shown { background:rgba(12,18,28,.4); }
.sheet-panel { display:flex; flex-direction:column; width:100%; max-width:520px; max-height:82vh; border-radius:24px; border:1px solid var(--line); background:var(--surface); color:var(--text); box-shadow:0 30px 100px rgba(0,0,0,.18); opacity:0; transform:translateY(22px) scale(.97); transition:opacity .24s ease,transform .28s cubic-bezier(.2,.8,.2,1); overflow:hidden; }.shown .sheet-panel { opacity:1; transform:translateY(0) scale(1); }
.sheet-header { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:24px 24px 18px; }.sheet-title { font-size:21px; font-weight:680; }.sheet-subtitle { display:block; margin-top:6px; font-size:12px; line-height:1.6; color:var(--muted); }.sheet-close { display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:50%; background:var(--surface-alt); color:var(--muted); flex:none; transition:transform .18s ease; }.sheet-close:active { transform:scale(.88); }
.sheet-body { overflow-y:auto; overscroll-behavior:contain; flex:1; min-height:0; max-height:60vh; box-sizing:border-box; padding:0 24px 24px; }.sheet-footer { padding:16px 24px; border-top:1px solid var(--line); }
@media(max-width:520px) { .sheet-mask { padding:12px; align-items:flex-end; padding-bottom:calc(12px + env(safe-area-inset-bottom)); }.sheet-panel { max-height:85vh; border-radius:24px; }.sheet-header { padding:22px 20px 18px; }.sheet-body { padding:0 20px 20px; } }
@media(prefers-reduced-motion:reduce) { .sheet-mask,.sheet-panel,.sheet-close { transition:none; } }
</style>
