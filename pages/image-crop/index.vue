<template>
  <view class="crop-page" :class="themeClass()">
    <view class="crop-shell">
      <view class="crop-top"><button class="crop-back" :disabled="working" @tap="cancel"><UiIcon name="chevron-left" /><text>{{ $t('取消') }}</text></button><text>{{ $t(options.title || '裁切图片') }}</text><button class="crop-reset" :disabled="working || !image" @tap="reset">{{ $t('重置') }}</button></view>
      <view class="crop-heading"><view>{{ $t('留下你想要的画面。') }}</view><text>{{ $t('拖动选区移动位置，拖动四角调整范围。') }}</text></view>
      <view v-if="image" id="crop-stage" class="crop-stage" @touchmove.stop.prevent="drag" @touchend="finishDrag" @touchcancel="finishDrag" @mousemove="drag" @mouseup="finishDrag" @mouseleave="finishDrag">
        <image class="crop-source" :src="image.path" mode="scaleToFill" :style="imageStyle" @load="imageLoaded = true" @error="imageError" />
        <view v-if="measured" class="crop-frame" :style="frameStyle" role="button" tabindex="0" :aria-label="$t('移动裁切区域')" @touchstart.stop.prevent="beginDrag($event)" @mousedown.stop.prevent="beginDrag($event)" @keydown="keyboard($event)">
          <view class="crop-thirds"><view></view><view></view><view></view><view></view></view>
          <view v-if="options.round" class="crop-circle"></view>
          <view v-for="corner in corners" :key="corner" class="crop-handle" :class="corner" role="button" tabindex="0" :aria-label="$t('调整裁切区域')" @touchstart.stop.prevent="beginDrag($event, corner)" @mousedown.stop.prevent="beginDrag($event, corner)" @keydown.stop="keyboard($event, corner)"><view></view></view>
        </view>
      </view>
      <view v-if="image" class="crop-controls">
        <view class="crop-measure"><text>{{ $t('裁切范围') }}</text><text>{{ Math.round(crop.width) }} × {{ Math.round(crop.height) }} px</text></view>
        <view v-if="!options.lockAspect" class="crop-ratios"><button v-for="choice in ratios" :key="choice.id" :class="{ selected: ratioId === choice.id }" :aria-pressed="ratioId === choice.id" :disabled="working" @tap="chooseRatio(choice)">{{ choice.label ? $t(choice.label) : choice.id }}</button></view>
        <text v-else class="crop-ratio-note">{{ $t('固定比例') }} {{ options.ratio === 1 ? '1:1' : '7:10' }}</text>
        <text v-if="gifSource" class="crop-gif-note">{{ $t('GIF 裁切后将保存为静态图片。') }}</text>
      </view>
      <view v-if="errorMessage" class="crop-error">{{ $m(errorMessage) }}</view>
      <view class="crop-footer"><button v-if="gifSource && options.allowOriginalGif" class="crop-original" :disabled="working || !imageLoaded" @tap="confirm(true)">{{ $t('使用原动图') }}</button><button class="crop-confirm" :disabled="working || !imageLoaded || !measured" @tap="confirm(false)">{{ working ? $t('正在保存图片…') : $t('使用裁切图片') }}</button></view>
    </view>
    <canvas canvas-id="writer-image-crop" id="writer-image-crop" class="crop-canvas" :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"></canvas>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import { onLoad, onReady, onResize, onUnload, onBackPress } from '@dcloudio/uni-app'
import { themeClass } from '../../src/store/preferences.js'
import { t } from '../../src/i18n.js'
import { centeredCrop, moveCrop, resizeCrop, fitImage } from '../../src/utils/image-crop.js'
import { getImageCropRequest, finishImageCrop, cancelImageCrop, createCroppedImage, saveCropImage } from '../../src/services/image-crop.js'
import UiIcon from '../../components/UiIcon.vue'

const instance = getCurrentInstance()
const request = ref(null), crop = ref({ x: 0, y: 0, width: 1, height: 1 })
const options = computed(() => request.value?.options || {})
const image = computed(() => request.value?.image)
const viewport = ref({ width: 1, height: 1 }), measured = ref(false), imageLoaded = ref(false)
const ratio = ref(0), ratioId = ref('free'), working = ref(false), errorMessage = ref('')
const canvasWidth = ref(1), canvasHeight = ref(1)
const corners = ['nw', 'ne', 'sw', 'se']
const ratios = [{ id: 'free', label: '自由', value: 0 }, { id: 'original', label: '原比例', value: -1 }, { id: '1:1', value: 1 }, { id: '4:3', value: 4 / 3 }, { id: '3:4', value: 3 / 4 }, { id: '16:9', value: 16 / 9 }]
const imageRect = computed(() => image.value ? fitImage(image.value, viewport.value) : { x: 0, y: 0, width: 1, height: 1, scale: 1 })
const imageStyle = computed(() => rectStyle(imageRect.value))
const frameStyle = computed(() => {
  const rect = imageRect.value, value = crop.value
  return rectStyle({ x: rect.x + value.x * rect.scale, y: rect.y + value.y * rect.scale, width: value.width * rect.scale, height: value.height * rect.scale })
})
const gifSource = computed(() => image.value?.type === 'gif' || /\.gif(?:\?|$)/i.test(image.value?.path || ''))
let requestId = '', gesture = null, disposed = false

function rectStyle(rect) { return { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' } }
onLoad(params => {
  requestId = params.id || ''
  request.value = getImageCropRequest(requestId) || null
  if (!image.value) { errorMessage.value = t('图片选择已失效，请返回重新选择'); return }
  ratio.value = options.value.ratio || 0
  reset()
})
onReady(measure)
onResize(measure)
onBackPress(() => working.value)
onUnload(() => { disposed = true; gesture = null; cancelImageCrop(requestId) })

async function measure() {
  await nextTick()
  if (disposed || !image.value) return
  uni.createSelectorQuery().in(instance.proxy).select('#crop-stage').boundingClientRect(rect => {
    if (disposed || !rect?.width || !rect?.height) return
    viewport.value = { width: rect.width, height: rect.height }; measured.value = true; gesture = null
  }).exec()
}
function reset() {
  if (!image.value || working.value) return
  gesture = null; crop.value = centeredCrop(image.value, ratio.value); errorMessage.value = ''
}
function chooseRatio(choice) {
  if (working.value) return
  ratioId.value = choice.id
  ratio.value = choice.value < 0 ? image.value.width / image.value.height : choice.value
  reset()
}
function point(event) {
  if (event.touches?.length > 1) return null
  const value = event.touches?.[0] || event.changedTouches?.[0] || event
  const x = value.clientX ?? value.pageX, y = value.clientY ?? value.pageY
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}
function beginDrag(event, corner = 'move') {
  const start = point(event)
  if (working.value || !start || !measured.value) return
  gesture = { start, corner, crop: { ...crop.value } }
}
function drag(event) {
  const current = point(event)
  if (!gesture || !current || working.value) return
  const dx = (current.x - gesture.start.x) / imageRect.value.scale, dy = (current.y - gesture.start.y) / imageRect.value.scale
  crop.value = gesture.corner === 'move' ? moveCrop(image.value, gesture.crop, dx, dy) : resizeCrop(image.value, gesture.crop, gesture.corner, dx, dy, ratio.value)
}
function finishDrag(event) { if (event) drag(event); gesture = null }
function keyboard(event, corner = 'move') {
  if (working.value || !image.value) return
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
  if (!delta) return
  event.preventDefault?.()
  const step = (event.shiftKey ? 20 : 4) / imageRect.value.scale, dx = delta[0] * step, dy = delta[1] * step
  crop.value = corner === 'move' ? moveCrop(image.value, crop.value, dx, dy) : resizeCrop(image.value, crop.value, corner, dx, dy, ratio.value)
}
function imageError() { imageLoaded.value = false; errorMessage.value = t('无法读取图片') }
function cancel() { if (!working.value) { cancelImageCrop(requestId); uni.navigateBack() } }
async function confirm(original) {
  if (working.value || !imageLoaded.value || !measured.value || !image.value) return
  working.value = true; gesture = null; errorMessage.value = ''
  try {
    const result = original
      ? await saveCropImage(image.value.path, { width: image.value.width, height: image.value.height, original: true }, uni)
      : await createCroppedImage({ canvasId: 'writer-image-crop', instance: instance.proxy, image: image.value, crop: { ...crop.value }, maxEdge: options.value.maxEdge || 2560,
        resize: size => { canvasWidth.value = size.width; canvasHeight.value = size.height },
        nextFrame: async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 80)) } })
    if (disposed || !finishImageCrop(requestId, result)) { uni.removeSavedFile({ filePath: result.path, fail: () => {} }); return }
    working.value = false
    uni.navigateBack()
  } catch (error) { if (!disposed) errorMessage.value = error.message || t('裁切图片生成失败，请重试') }
  finally { working.value = false }
}
</script>

<style scoped>
.crop-page { height:100vh; box-sizing:border-box; padding:calc(var(--status-bar-height) + 14px) 20px calc(20px + env(safe-area-inset-bottom)); background:var(--bg); color:var(--text); overflow:hidden; }
.crop-shell { position:relative; z-index:1; display:flex; flex-direction:column; gap:18px; height:100%; max-width:900px; margin:auto; }
.crop-top { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; font-weight:650; flex-shrink:0; }
.crop-top button { display:flex; align-items:center; gap:3px; margin:0; padding:8px 0; background:transparent; font-size:12px; line-height:1.5; color:var(--accent); }
.crop-heading { flex-shrink:0; }.crop-heading view { font-size:24px; font-weight:700; }.crop-heading text { display:block; margin-top:8px; font-size:12px; color:var(--muted); line-height:1.7; }
.crop-stage { position:relative; flex:1; min-height:160px; overflow:hidden; background:var(--surface-alt); border-radius:16px; touch-action:none; user-select:none; }
.crop-source { position:absolute; pointer-events:none; }
.crop-frame { position:absolute; box-sizing:border-box; border:2px solid #fff; box-shadow:0 0 0 2000px rgba(0,0,0,.52); cursor:move; touch-action:none; }
.crop-thirds { position:absolute; inset:0; pointer-events:none; }.crop-thirds view { position:absolute; background:rgba(255,255,255,.3); }.crop-thirds view:nth-child(1),.crop-thirds view:nth-child(2) { top:0; bottom:0; width:1px; }.crop-thirds view:nth-child(1) { left:33.333%; }.crop-thirds view:nth-child(2) { left:66.666%; }.crop-thirds view:nth-child(3),.crop-thirds view:nth-child(4) { left:0; right:0; height:1px; }.crop-thirds view:nth-child(3) { top:33.333%; }.crop-thirds view:nth-child(4) { top:66.666%; }
.crop-circle { position:absolute; inset:0; border:1px dashed rgba(255,255,255,.8); border-radius:50%; pointer-events:none; }
.crop-handle { position:absolute; width:44px; height:44px; display:flex; align-items:center; justify-content:center; touch-action:none; }.crop-handle view { width:12px; height:12px; border:3px solid #fff; border-radius:3px; background:var(--accent); box-shadow:0 1px 6px rgba(0,0,0,.3); }.crop-handle.nw { left:-22px; top:-22px; cursor:nwse-resize; }.crop-handle.ne { right:-22px; top:-22px; cursor:nesw-resize; }.crop-handle.sw { left:-22px; bottom:-22px; cursor:nesw-resize; }.crop-handle.se { right:-22px; bottom:-22px; cursor:nwse-resize; }
.crop-controls { flex-shrink:0; }.crop-measure { display:flex; justify-content:space-between; gap:12px; font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }
.crop-ratios { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }.crop-ratios button { flex:1; min-width:48px; margin:0; padding:9px 7px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--muted); font-size:11px; line-height:1.5; }.crop-ratios button.selected { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
.crop-ratio-note,.crop-gif-note { display:block; margin-top:12px; color:var(--muted); font-size:11px; line-height:1.6; }
.crop-error { flex-shrink:0; color:var(--danger,#aa5050); font-size:12px; line-height:1.6; }
.crop-footer { display:flex; flex-shrink:0; gap:10px; }.crop-footer button { flex:1; margin:0; padding:14px 12px; border-radius:12px; font-size:13px; line-height:1.5; }.crop-confirm { background:var(--accent); color:var(--on-accent,#fff); font-weight:650; }.crop-original { background:var(--surface); color:var(--accent); }
button::after { border:none; }button[disabled] { opacity:.45; }.crop-page :focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.crop-canvas { position:fixed; top:0; left:0; z-index:0; opacity:.001; pointer-events:none; }
@media(max-height:600px) { .crop-heading { display:none; }.crop-shell { gap:10px; }.crop-stage { min-height:80px; }.crop-footer button { padding:10px; } }
</style>
