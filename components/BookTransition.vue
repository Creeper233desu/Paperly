<template>
  <view class="book-transition" :class="[themeClass(), `book-${phase}`]" :style="{ '--book-motion': BOOK_MOTION_MS + 'ms', clipPath }" :aria-busy="!interactive">
    <view class="book-surface" :style="surfaceStyle" @transitionend="surfaceEnd"></view>
    <scroll-view scroll-y class="book-scroll" :class="{ interactive }">
      <BookPanel ref="panel" :book-id="bookId" :cover-color="coverColor" :motion="phase" :hide-shared="sharedVisible || phase === 'preparing'" @close="requestClose" />
    </scroll-view>
    <view v-if="sharedVisible && book" class="shared-elements" aria-hidden="true">
      <view class="shared-cover" :style="{ ...elementStyle('cover'), background:coverColor, boxShadow:atCard ? 'none' : '10px 15px 28px var(--shadow)' }">
        <image v-if="book.cover" :src="book.cover" mode="aspectFill" />
        <view v-else class="shared-cover-letter" :style="{ fontSize:letterSize }">{{ book.title.slice(0, 1) }}</view>
        <view class="shared-spine" :style="{ width:spineWidth }"></view>
      </view>
      <view class="shared-title" :style="elementStyle('title')">{{ book.title }}</view>
      <view class="shared-author" :style="elementStyle('author')">{{ book.author || $t('未设置作者') }}</view>
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import BookPanel from './BookPanel.vue'
import { getBook } from '../src/store/library'
import { themeClass } from '../src/store/preferences'
import { BOOK_MOTION_MS, readBookRects, sharedRectStyle, usableRect } from '../src/utils/book-transition.js'

const props = defineProps({ bookId:String, origin:Object, coverColor:String, measureOrigin:Function })
const emit = defineEmits(['handoff', 'closed'])
const owner = getCurrentInstance()?.proxy, panel = ref(null)
const book = computed(() => getBook(props.bookId))
const phase = ref('preparing'), closingRequested = ref(false)
const source = shallowRef(props.origin), destination = shallowRef(null), viewport = shallowRef(null)
let revision = 0, frame, finishTimer, queuedClose = false, motionStartedAt = 0
const atCard = computed(() => phase.value === 'preparing' || phase.value === 'closing')
const interactive = computed(() => phase.value === 'ready' && !closingRequested.value)
const sharedVisible = computed(() => phase.value !== 'ready' && phase.value !== 'closed' && !!source.value && !!destination.value)
const currentRects = computed(() => atCard.value ? source.value : destination.value)
const clipPath = computed(() => {
  const card = source.value?.frame, frame = viewport.value
  if (!atCard.value || !usableRect(card) || !usableRect(frame)) return 'inset(0px 0px 0px 0px round 0px)'
  const left = card.left - frame.left, top = card.top - frame.top
  return `inset(${top}px ${frame.width - left - card.width}px ${frame.height - top - card.height}px ${left}px round ${card['border-radius'] || '22px'})`
})
const surfaceStyle = computed(() => ({
  ...sharedRectStyle(atCard.value && source.value ? source.value.frame : viewport.value, viewport.value),
  borderRadius:atCard.value && source.value ? source.value.frame['border-radius'] || '22px' : '0px',
  background:atCard.value ? 'var(--surface)' : 'var(--bg)',
  opacity:viewport.value ? 1 : 0
}))
const elementStyle = key => sharedRectStyle(currentRects.value?.[key], viewport.value)
const letterSize = computed(() => currentRects.value?.letter?.['font-size'] || `${(currentRects.value?.cover?.height || 166) * .35}px`)
const spineWidth = computed(() => `${currentRects.value?.spine?.width || 7}px`)

function stopTimers() { clearTimeout(frame); clearTimeout(finishTimer) }
function settle() {
  if (phase.value !== 'opening' && phase.value !== 'closing') return
  stopTimers()
  if (phase.value === 'opening') {
    phase.value = 'ready'
    if (queuedClose) { queuedClose = false; requestClose() }
  } else if (phase.value === 'closing') { phase.value = 'closed'; emit('closed') }
}
function surfaceEnd(event) {
  const property = event?.detail?.propertyName || event?.propertyName
  if (property === 'transform' && Date.now() - motionStartedAt >= BOOK_MOTION_MS - 16) settle()
}
async function play(nextPhase, current) {
  await nextTick()
  if (current !== revision) return
  frame = setTimeout(() => {
    if (current !== revision) return
    motionStartedAt = Date.now()
    phase.value = nextPhase
    // transitionend is preferred; keep a margin for the App view bridge.
    finishTimer = setTimeout(settle, BOOK_MOTION_MS + 60)
  }, 32)
}
async function prepare() {
  const current = ++revision
  await nextTick()
  const [stage, target] = await Promise.all([readBookRects(owner, { frame:'.book-transition' }), panel.value?.measureShared()])
  if (current !== revision) return
  viewport.value = stage?.frame || windowRect()
  destination.value = target || null
  if (!target) source.value = null
  await nextTick()
  if (current !== revision) return
  emit('handoff')
  play('opening', current)
}
function windowRect() {
  try { const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync(); return { left:0, top:0, width:info.windowWidth, height:info.windowHeight } }
  catch { return { left:0, top:0, width:360, height:720 } }
}
async function requestClose() {
  if (phase.value === 'closing' || phase.value === 'preparing-close' || closingRequested.value) return
  if (phase.value === 'preparing') { revision++; stopTimers(); phase.value = 'closed'; emit('closed'); return }
  if (phase.value === 'opening') { queuedClose = true; return }
  if (panel.value?.dismissOverlay()) return
  closingRequested.value = true
  const current = ++revision
  const [origin, target, stage] = await Promise.all([props.measureOrigin?.(), panel.value?.measureShared(), readBookRects(owner, { frame:'.book-transition' })])
  if (current !== revision) return
  if (usableRect(stage?.frame)) viewport.value = stage.frame
  source.value = origin || source.value
  destination.value = target || destination.value
  phase.value = 'preparing-close'
  await play('closing', current)
}
onMounted(prepare)
onUnmounted(() => { revision++; stopTimers() })
defineExpose({ requestClose })
</script>

<style scoped>
.book-transition { position:fixed; z-index:40; inset:0; overflow:hidden; color:var(--text); isolation:isolate; transition:clip-path var(--book-motion) cubic-bezier(.22,.82,.22,1); }
.book-surface { position:absolute; z-index:0; top:0; left:0; box-shadow:0 10px 35px var(--shadow); transition:transform var(--book-motion) cubic-bezier(.22,.82,.22,1),width var(--book-motion) cubic-bezier(.22,.82,.22,1),height var(--book-motion) cubic-bezier(.22,.82,.22,1),border-radius var(--book-motion) ease,background-color var(--book-motion) ease,opacity .2s ease; }
.book-scroll { position:relative; z-index:1; width:100%; height:100%; pointer-events:none; overscroll-behavior:contain; }.book-scroll.interactive { pointer-events:auto; }
.shared-elements { position:absolute; z-index:2; inset:0; pointer-events:none; overflow:hidden; }
.shared-cover,.shared-title,.shared-author { position:absolute; top:0; left:0; margin:0; transform-origin:top left; backface-visibility:hidden; transition:transform var(--book-motion) cubic-bezier(.22,.82,.22,1),width var(--book-motion) cubic-bezier(.22,.82,.22,1),height var(--book-motion) cubic-bezier(.22,.82,.22,1),font-size var(--book-motion) ease,line-height var(--book-motion) ease,color var(--book-motion) ease,border-radius var(--book-motion) ease; }
.shared-cover { display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:5px 13px 13px 5px; transition-property:transform,width,height,font-size,line-height,color,border-radius,box-shadow; transition-duration:var(--book-motion); transition-timing-function:cubic-bezier(.22,.82,.22,1); }
.shared-cover image { display:block; width:100%; height:100%; }.shared-cover-letter { font-family:serif; color:#fff; line-height:1; transition:font-size var(--book-motion) ease; }
.shared-spine { position:absolute; top:0; bottom:0; left:0; background:rgba(0,0,0,.12); transition:width var(--book-motion) ease; }
.shared-title { overflow:hidden; color:var(--text); font-size:20px; font-weight:700; line-height:1.25; word-break:break-all; }
.shared-author { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--muted); font-size:13px; }
.book-preparing,.book-preparing .book-surface,.book-preparing .shared-cover,.book-preparing .shared-title,.book-preparing .shared-author { transition:none; }
@media(prefers-reduced-motion:reduce) { .book-transition,.book-surface,.shared-cover,.shared-title,.shared-author,.shared-cover-letter,.shared-spine { transition:none; } }
</style>
