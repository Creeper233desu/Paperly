<template>
  <view class="rolling-number" :class="{ animating:started }" role="text" :aria-label="counterLabel(value, signed)">
    <view v-for="reel in reels" :key="reel.key" class="reel-window" aria-hidden="true" :style="{ width:(started ? reel.to : reel.from) === ' ' ? '0em' : reel.sign ? '.5em' : '.64em' }">
      <view class="reel-track" :style="{ transform:`translate3d(0, -${started ? (reel.rows.length - 1) * 1.12 : 0}em, 0)`, transitionDelay:`${Math.min(reel.place || 0, 5) * 22}ms` }"><view v-for="(digit, index) in reel.rows" :key="index" class="reel-digit">{{ digit }}</view></view>
    </view>
  </view>
</template>
<script setup>
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { counterLabel, counterValue, numberReels } from '../src/utils/number-reels.js'
const props = defineProps({ value:{ type:Number, default:0 }, signed:Boolean, active:{ type:Boolean, default:true }, play:{ type:Boolean, default:true } })
const reels = ref(numberReels(0, 0)), started = ref(false)
let displayed = 0, target = 0, revision = 0, startTimer, finishTimer
function stopTimers() { clearTimeout(startTimer); clearTimeout(finishTimer); revision++ }
function settle(value) { displayed = value; started.value = false; reels.value = numberReels(value, value, props.signed) }
function update() {
  const next = counterValue(props.value), previous = started.value ? target : displayed
  stopTimers()
  // Keep the old face while the panel is arriving. Disabling playback must
  // not consume the pending value, or there would be nothing left to roll.
  if (!props.active || props.play === false) { settle(previous); return }
  target = next
  if (next === previous) { settle(next); return }
  started.value = false; reels.value = numberReels(previous, next, props.signed)
  const current = revision
  nextTick(() => {
    if (current !== revision) return
    startTimer = setTimeout(() => {
      if (current !== revision) return
      started.value = true
      finishTimer = setTimeout(() => { if (current === revision) settle(next) }, 1280)
    }, 32)
  })
}
watch(() => [props.value, props.active, props.play, props.signed], update, { immediate:true })
onUnmounted(stopTimers)
</script>
<style scoped>
.rolling-number { display:inline-flex; align-items:center; vertical-align:bottom; white-space:nowrap; line-height:1.12; font-variant-numeric:tabular-nums; }
.reel-window { height:1.12em; overflow:hidden; flex:none; transition:width .9s cubic-bezier(.22,.7,.3,1); }
.reel-track { transition:none; }.animating .reel-track { transition:transform 1.05s cubic-bezier(.22,.7,.3,1); }
.reel-digit { height:1.12em; line-height:1.12; text-align:center; }
@media(prefers-reduced-motion:reduce) { .reel-window,.animating .reel-track { transition:none; } }
</style>
