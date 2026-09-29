<template><AppSheet :visible="visible" title="插入图片" subtitle="图片会放在当前光标处，独立成段。" @close="close"><view v-if="image" class="image-preview"><image :src="image.path" mode="aspectFit" /><view class="image-meta"><text>{{ image.width }} × {{ image.height }}</text><view @tap="choose">更换图片</view></view></view><view v-else class="image-pick" @tap="choose"><view class="image-pick-icon"><UiIcon name="image" /></view><strong>{{ busy ? '正在读取图片…' : '从相册选择' }}</strong><text>保留图片比例，随正文一起保存</text></view><view v-if="error" class="image-error">{{ error }}</view><template #footer><view class="image-actions"><view class="image-cancel" @tap="close">取消</view><view class="image-confirm" :class="{ disabled: !image || busy }" @tap="confirm"><UiIcon name="plus" /><text>插入正文</text></view></view></template></AppSheet></template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import AppSheet from './AppSheet.vue'
import UiIcon from './UiIcon.vue'
import { chooseArticleImage } from '../src/services/article-images.js'
const props = defineProps({ visible:Boolean })
const emit = defineEmits(['close', 'insert'])
const image = ref(null), busy = ref(false), error = ref('')
let generation = 0
function remove(value) { if (value?.path) uni.removeSavedFile({ filePath:value.path, fail:() => {} }) }
function reset() { generation++; remove(image.value); image.value = null; error.value = ''; busy.value = false }
watch(() => props.visible, visible => { if (!visible) reset() })
onBeforeUnmount(reset)
async function choose() {
  if (busy.value) return
  const revision = generation
  busy.value = true; error.value = ''
  try {
    const selected = await chooseArticleImage()
    if (revision !== generation || !props.visible) { remove(selected); return }
    remove(image.value); image.value = selected
  } catch (cause) { if (revision === generation && !String(cause.message).includes('取消')) error.value = cause.message }
  finally { if (revision === generation) busy.value = false }
}
function close() { emit('close') }
function confirm() { if (!image.value || busy.value) return; const selected = image.value; image.value = null; emit('insert', selected); emit('close') }
</script>
<style scoped>
.image-pick { border:1.5px dashed var(--line); border-radius:18px; min-height:220px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:13px; color:var(--accent); background:var(--surface-alt); transition:transform .2s ease; }.image-pick:active { transform:scale(.98); }.image-pick-icon { display:flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:15px; background:var(--surface); }.image-pick strong { font-size:16px; font-weight:600; }.image-pick text { font-size:12px; color:var(--muted); }.image-preview { overflow:hidden; border-radius:16px; background:var(--surface-alt); }.image-preview image { display:block; width:100%; height:32vh; }.image-meta { padding:13px 16px; display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--muted); }.image-meta view { color:var(--accent); padding:4px; }.image-actions { display:flex; justify-content:flex-end; align-items:center; gap:12px; }.image-cancel { padding:11px 16px; font-size:13px; color:var(--muted); }.image-confirm { display:flex; align-items:center; gap:6px; padding:10px 17px; border-radius:12px; font-size:13px; font-weight:600; color:var(--surface); background:var(--accent); transition:opacity .2s ease,transform .2s ease; }.image-confirm.disabled { opacity:.35; }.image-confirm:active { transform:scale(.97); }.image-error { margin-top:12px; color:var(--danger); font-size:12px; line-height:1.6; }
@media(prefers-reduced-motion:reduce) { .image-pick,.image-confirm { transition:none; } }
</style>
