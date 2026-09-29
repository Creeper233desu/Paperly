<template><view class="size-control"><view class="size-heading"><text>{{ title || $t('正文字号') }}</text><text class="size-value">{{ value }} px</text></view><slider :value="value" :min="MIN_FONT_SIZE" :max="MAX_FONT_SIZE" :step="1" :block-size="22" activeColor="#5774a0" backgroundColor="#b6c1d033" @changing="change" @change="change" /><view class="size-labels"><text>{{ $t('小') }}</text><text>{{ $t('大') }}</text></view><slot></slot></view></template>
<script setup>
import { MIN_FONT_SIZE, MAX_FONT_SIZE, clampFontSize } from '../src/utils/font-scale.js'
defineProps({ value: { type:Number, default:18 }, title: { type:String, default:'' } })
const emit = defineEmits(['change'])
function change(event) { emit('change', clampFontSize(event.detail?.value)) }
</script>
<style scoped>.size-heading,.size-labels { display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; }.size-value { color:var(--accent); font-variant-numeric:tabular-nums; }.size-labels { color:var(--muted); font-size:11px; font-weight:400; }.size-control slider { margin:16px 0 8px; }</style>
