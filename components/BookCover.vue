<template>
  <view class="book-cover" :style="{ background:color }">
    <image v-if="src && !failed" :key="src" class="book-cover-image" :class="imageClass" :src="src" mode="aspectFill" @load="onLoad" @error="onError" />
    <view v-else class="book-cover-letter" :class="letterClass">{{ letter }}</view>
    <view class="book-cover-spine" :class="spineClass"></view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  src:{ type:String, default:'' },
  title:{ type:String, default:'' },
  color:{ type:String, default:'#58718e' },
  letterClass:{ type:String, default:'' },
  spineClass:{ type:String, default:'' },
  imageClass:{ type:String, default:'' }
})
const emit = defineEmits(['load', 'error'])
const failed = ref(false)
const letter = computed(() => Array.from(props.title)[0] || '')
watch(() => props.src, () => { failed.value = false })
function onLoad(event) { emit('load', props.src, event) }
function onError(event) { failed.value = true; emit('error', props.src, event) }
</script>

<style scoped>
.book-cover {
  position:relative;
  display:flex;
  flex-shrink:0;
  align-items:center;
  justify-content:center;
  width:var(--cover-width,113px);
  height:calc(var(--cover-width,113px) * 10 / 7);
  overflow:hidden;
  border-radius:calc(var(--cover-width,113px) * .04) calc(var(--cover-width,113px) * .10) calc(var(--cover-width,113px) * .10) calc(var(--cover-width,113px) * .04);
  box-shadow:calc(var(--cover-width,113px) * .054) calc(var(--cover-width,113px) * .081) calc(var(--cover-width,113px) * .15) var(--shadow);
}
.book-cover-image { display:block; width:100%; height:100%; }
.book-cover-letter { font-family:serif; font-size:calc(var(--cover-width,113px) * .5); line-height:1; color:rgba(255,255,255,.94); }
.book-cover-spine { position:absolute; left:0; top:0; bottom:0; width:calc(var(--cover-width,113px) * .06); background:rgba(0,0,0,.12); }
</style>
