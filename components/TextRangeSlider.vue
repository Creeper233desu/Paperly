<template>
  <view class="text-range" :class="{ empty: !length, dragging: !!dragSide, crowded }">
    <view class="range-labels"><text>{{ $t('起点') }}</text><text>{{ $t('终点') }}</text></view>
    <view class="range-controls">
      <input class="range-number" type="number" :disabled="!length" :value="startDraft" :aria-label="$t('起点')" @input="startDraft = $event.detail.value" @blur="commitNumber('start')" @confirm="commitNumber('start')" />
      <view class="range-track" @touchstart.stop="beginTrack" @touchmove.stop.prevent="drag" @touchend.stop="finish" @touchcancel.stop="finish">
        <view class="range-rail" /><view class="range-fill" :style="{ left:startPercent + '%', width:(endPercent - startPercent) + '%' }" />
        <view class="range-thumb start-thumb" :class="{ active: dragSide === 'start' }" :style="{ left:startPercent + '%' }" @touchstart.stop="begin('start', $event)"><view /></view>
        <view class="range-thumb end-thumb" :class="{ active: dragSide === 'end' }" :style="{ left:endPercent + '%' }" @touchstart.stop="begin('end', $event)"><view /></view>
      </view>
      <input class="range-number" type="number" :disabled="!length" :value="endDraft" :aria-label="$t('终点')" @input="endDraft = $event.detail.value" @blur="commitNumber('end')" @confirm="commitNumber('end')" />
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { moveRangeEdge, rangeOffsetAt, textRange } from '../src/utils/text-range.js'
const props = defineProps({ length: { type:Number, default:0 }, start: { type:Number, default:0 }, end: { type:Number, default:0 } })
const emit = defineEmits(['change'])
const instance = getCurrentInstance()
const range = ref(textRange(props.length, props.start, props.end)), startDraft = ref(''), endDraft = ref(''), dragSide = ref('')
const startPercent = computed(() => props.length ? range.value.start / props.length * 100 : 0)
const endPercent = computed(() => props.length ? range.value.end / props.length * 100 : 0)
const crowded = computed(() => props.length && (range.value.end - range.value.start) / props.length < .15)
let bounds = null, touchId = null, latestX = 0, gesture = 0
function refreshNumbers() { startDraft.value = props.length ? String(range.value.start + 1) : '0'; endDraft.value = String(range.value.end) }
watch(() => [props.length, props.start, props.end], () => { range.value = textRange(props.length, props.start, props.end); refreshNumbers() }, { immediate:true })
function change(side, value) { range.value = moveRangeEdge(props.length, range.value, side, value); refreshNumbers(); emit('change', { ...range.value }) }
function commitNumber(side) { change(side, side === 'start' ? Number(startDraft.value) - 1 : Number(endDraft.value)) }
function touch(event) { return [...(event.touches?.length ? event.touches : event.changedTouches || [])].find(item => touchId === null || item.identifier === touchId) }
function begin(side, event) {
  if (!props.length) return
  const point = touch(event)
  if (!point) return
  touchId = point.identifier ?? null; latestX = point.clientX ?? point.pageX; dragSide.value = side; bounds = null
  const current = ++gesture
  uni.createSelectorQuery().in(instance.proxy).select('.range-track').boundingClientRect(rect => {
    if (gesture !== current || !dragSide.value || !rect) return
    bounds = rect
    if (!dragSide.value || dragSide.value === 'nearest') {
      const offset = rangeOffsetAt(latestX, bounds, props.length)
      dragSide.value = Math.abs(offset - range.value.start) < Math.abs(offset - range.value.end) ? 'start' : 'end'
    }
    change(dragSide.value, rangeOffsetAt(latestX, bounds, props.length))
  }).exec()
}
function beginTrack(event) { begin('nearest', event) }
function drag(event) { const point = touch(event); if (!point || !dragSide.value) return; latestX = point.clientX ?? point.pageX; if (bounds) change(dragSide.value, rangeOffsetAt(latestX, bounds, props.length)) }
function finish(event) { drag(event); dragSide.value = ''; bounds = null; touchId = null; gesture++ }
</script>

<style scoped>
.range-labels { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin:16px 0 3px; }
.range-controls { display:flex; align-items:center; gap:22px; }
.range-number { flex:none; width:60px; height:38px; color:var(--text); background:var(--surface-alt); border:1px solid var(--line); border-radius:10px; text-align:center; font-size:12px; box-sizing:border-box; }
.range-track { position:relative; flex:1; min-width:40px; height:52px; touch-action:none; }
.range-rail,.range-fill { position:absolute; top:24px; height:4px; border-radius:4px; }
.range-rail { left:0; right:0; background:var(--line); }.range-fill { background:var(--accent); }
.range-thumb { position:absolute; top:6px; width:40px; height:40px; margin-left:-20px; display:flex; justify-content:center; align-items:center; z-index:1; }
.range-thumb>view { width:21px; height:21px; border-radius:50%; background:var(--surface); border:2px solid var(--accent); box-shadow:0 2px 7px var(--shadow); transition:transform .16s ease,box-shadow .16s ease; }
.range-thumb.active { z-index:2; }.range-thumb.active>view { transform:scale(1.14); box-shadow:0 0 0 5px var(--accent-soft); }
.crowded .start-thumb { top:-7px; }.crowded .end-thumb { top:19px; }
.empty { opacity:.45; pointer-events:none; }@media(prefers-reduced-motion:reduce) { .range-thumb>view { transition:none; } }
</style>
