<template>
  <view class="reader-screen" :class="themeClass()">
    <view class="reader-header"><view class="back-action" @tap="back"><UiIcon name="chevron-left" /><text>返回书籍</text></view><view class="header-title"><strong>{{ book?.title || '阅读' }}</strong><text>{{ positionLabel }}</text></view><view class="header-actions"><view class="pinch-lock" :class="{ unlocked: !pinchLocked }" :aria-label="pinchLocked ? '解锁双指缩放' : '锁定双指缩放'" @tap="pinchLocked = !pinchLocked"><view class="lock-icon" :class="{ unlocked: !pinchLocked }"></view></view><view class="font-button" :class="{ selected: showFontSize }" aria-label="调整阅读字号" @tap="toggleFontSize">Aa</view><view class="toc-button" :class="{ selected: tocOpen }" @tap="toggleToc"><view class="toc-glyph"><view></view><view></view><view></view></view><text>目录</text></view><view class="page-control" :class="{ disabled: currentIndex <= 0 }" aria-label="上一篇" @tap="change(-1)"><UiIcon name="chevron-left" /></view><view class="page-control" :class="{ disabled: currentIndex >= sections.length - 1 }" aria-label="下一篇" @tap="change(1)"><UiIcon name="chevron-right" /></view></view></view>
    <view v-if="tocOpen" class="toc-backdrop" @tap="tocOpen = false"></view>
    <view v-if="showFontSize" class="font-backdrop" @tap="showFontSize = false"></view>
    <view v-if="showFontSize" class="font-size-panel"><FontSizeControl :value="prefs.fontSize" title="阅读字号" @change="setReadingFontSize" /><view class="font-size-hint">{{ pinchLocked ? '点击顶部锁图标，开启双指缩放' : '双指缩放已开启，点击锁图标可锁定字号' }}</view></view>
    <view class="reader-layout"><view class="reader-toc" :class="{ open: tocOpen }"><view class="toc-head"><text>书籍目录</text><view @tap="tocOpen = false"><UiIcon name="close" /></view></view><scroll-view scroll-y class="toc-scroll"><view v-for="(group, groupIndex) in outline" :key="groupIndex" class="toc-group"><view class="toc-chapter">{{ group.title }}</view><view v-for="article in group.articles" :key="article.id" class="toc-article" :class="{ current: currentSection?.id === article.id }" @tap="selectById(article.id)">{{ article.title || group.title }}</view></view></scroll-view></view>
      <ReadingSurface :enabled="!pinchLocked" @pinch="onPinch"><scroll-view class="reader-content" scroll-y :scroll-into-view="topAnchor" @touchstart="onTouchStart" @touchend="onTouchEnd" @touchcancel="touchStart = null"><view :id="topAnchorId" class="reader-top-anchor"></view><view v-if="error" class="reader-error">{{ error }}</view><view v-else-if="currentSection" class="reading-sheet" :style="{ '--reading-font': fontFamilyFor(prefs.font), '--reading-size': `${prefs.fontSize}px` }"><view v-if="currentIndex === 0 && book?.cover" class="opening-cover"><image :src="book.cover" mode="aspectFit" /><view><strong>{{ book.title }}</strong><text>{{ book.author }}</text></view></view><view class="chapter-kicker">{{ currentSection.chapterTitle }}</view><view v-if="currentSection.title && currentSection.title !== currentSection.chapterTitle" class="section-title">{{ currentSection.title }}</view><view v-for="(block, index) in currentSection.blocks" :key="index" class="read-block" :class="block.type"><image v-if="block.type === 'image' && block.src" :src="block.src" mode="widthFix" /><text v-else-if="block.type !== 'image'">{{ block.text }}</text></view><view class="section-end">{{ currentIndex + 1 }} / {{ sections.length }}</view></view><view v-else class="reader-loading">这本书还没有正文。返回书籍页添加章节后即可阅读。</view></scroll-view></ReadingSurface>
    </view>
  </view>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getBook } from '../../src/store/library'
import { loadPreferences, preferences, themeClass, updatePreferences } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import { imageIdFromParagraph } from '../../src/utils/media'
import { clampFontSize, scaleFontSize } from '../../src/utils/font-scale'
import FontSizeControl from '../../components/FontSizeControl.vue'
import ReadingSurface from '../../components/ReadingSurface.vue'
import UiIcon from '../../components/UiIcon.vue'
loadPreferences()
const prefs = preferences
const bookId = ref(''), book = computed(() => getBook(bookId.value))
const currentIndex = ref(0), tocOpen = ref(false), showFontSize = ref(false), pinchLocked = ref(true), error = ref('')
const topAnchor = ref(''), topAnchorId = ref('reader-top-0')
let anchorRevision = 0, touchStart = null
const outline = computed(() => (book.value?.chapters || []).map(chapter => ({ title:chapter.title, articles:chapter.articles })))
const sections = computed(() => (book.value?.chapters || []).flatMap(chapter => chapter.articles.map(article => ({ id:article.id, chapterTitle:chapter.title, title:article.title, blocks:(article.paragraphs || []).map(paragraph => {
  const id = imageIdFromParagraph(paragraph)
  return id ? { type:'image', src:article.images?.[id]?.path || '' } : { type:'paragraph', text:paragraph.replace(/^[\u3000\t]+/, '') }
}) }))))
const currentSection = computed(() => sections.value[currentIndex.value])
const positionLabel = computed(() => currentSection.value ? `${currentSection.value.chapterTitle} · ${currentIndex.value + 1} / ${sections.value.length}` : '')
onLoad(options => {
  bookId.value = options.bookId || ''
  if (!book.value) { error.value = '书籍不存在'; return }
  if (book.value.readOnly) { error.value = '请返回书籍页，将原文件转换为可编辑书籍后阅读。'; return }
  loadSelectedFont().catch(() => {})
  currentIndex.value = Math.max(0, sections.value.findIndex(section => section.id === options.section))
})
function back() { uni.navigateBack() }
function toggleToc() { showFontSize.value = false; tocOpen.value = !tocOpen.value }
function toggleFontSize() { tocOpen.value = false; showFontSize.value = !showFontSize.value }
function setReadingFontSize(size) { const next = clampFontSize(size, prefs.fontSize); if (next !== prefs.fontSize) updatePreferences({ fontSize:next }) }
function onPinch(ratio) { if (!pinchLocked.value) setReadingFontSize(scaleFontSize(prefs.fontSize, ratio)) }
function select(index) {
  if (index < 0 || index >= sections.value.length) return
  currentIndex.value = index; tocOpen.value = false; showFontSize.value = false
  const id = `reader-top-${++anchorRevision}`; topAnchorId.value = id
  nextTick(() => { topAnchor.value = id })
}
function selectById(id) { select(sections.value.findIndex(section => section.id === id)) }
function change(step) { select(currentIndex.value + step) }
function onTouchStart(event) {
  if (event.touches?.length !== 1) { touchStart = null; return }
  const point = event.touches[0]; touchStart = { x:point.clientX, y:point.clientY }
}
function onTouchEnd(event) {
  const point = event.changedTouches?.[0]
  if (!point || !touchStart) return
  const dx = point.clientX - touchStart.x, dy = point.clientY - touchStart.y
  touchStart = null
  if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.6) change(dx < 0 ? 1 : -1)
}
</script>
<style scoped>
.reader-screen { height:100vh; box-sizing:border-box; padding-top:var(--status-bar-height); background:var(--bg); color:var(--text); overflow:hidden; }
.reader-header { height:64px; display:flex; align-items:center; gap:16px; padding:0 28px; box-sizing:border-box; border-bottom:1px solid var(--line); background:var(--surface); }
.back-action { display:flex; align-items:center; gap:9px; min-width:140px; color:var(--accent); font-size:13px; }
.back-chevron { width:8px; height:8px; border-left:2px solid currentColor; border-bottom:2px solid currentColor; transform:rotate(45deg); }
.header-title { min-width:0; flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; }.header-title strong { font-size:14px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.header-title text { font-size:10px; color:var(--muted); }
.header-actions { display:flex; align-items:center; gap:8px; }.toc-button { display:flex; align-items:center; gap:7px; padding:8px 10px; border-radius:9px; color:var(--muted); font-size:12px; }.toc-button.selected { background:var(--accent-soft); color:var(--accent); }.toc-glyph { width:16px; display:flex; flex-direction:column; gap:3px; }.toc-glyph view { width:16px; height:1.5px; background:currentColor; border-radius:2px; }.toc-glyph view:nth-child(2) { width:12px; }.page-control { display:flex; align-items:center; justify-content:center; width:31px; height:31px; border-radius:8px; background:var(--surface-alt); font-size:24px; line-height:1; transition:transform .2s ease,opacity .2s ease; }.page-control:active { transform:scale(.88); }.page-control.disabled { opacity:.3; }
.font-button,.pinch-lock { display:flex; align-items:center; justify-content:center; width:34px; height:34px; flex:none; border-radius:9px; color:var(--muted); background:var(--surface-alt); transition:transform .2s ease,background .2s ease,color .2s ease; }
.font-button { font-size:14px; font-weight:700; letter-spacing:-.04em; }.font-button.selected,.pinch-lock.unlocked { color:var(--accent); background:var(--accent-soft); }.font-button:active,.pinch-lock:active { transform:scale(.9); }
.lock-icon { position:relative; width:16px; height:13px; margin-top:6px; border:2px solid currentColor; border-radius:3px; box-sizing:border-box; }.lock-icon::before { content:''; position:absolute; left:2px; bottom:9px; width:8px; height:9px; border:2px solid currentColor; border-bottom:0; border-radius:7px 7px 0 0; box-sizing:border-box; transition:transform .2s ease; }.lock-icon.unlocked::before { transform:translateX(7px); }
.font-backdrop { position:fixed; z-index:19; inset:0; background:transparent; }.font-size-panel { position:fixed; z-index:20; top:calc(var(--status-bar-height) + 72px); right:28px; width:min(290px,calc(100vw - 34px)); box-sizing:border-box; padding:16px 20px 14px; border:1px solid var(--line); border-radius:18px; background:var(--surface); box-shadow:0 20px 55px var(--shadow); animation:reader-panel-in .2s ease both; }.font-size-title,.font-size-range { display:flex; justify-content:space-between; color:var(--text); font-size:13px; font-weight:650; }.font-size-range { color:var(--muted); font-size:10px; font-weight:400; }.font-size-hint { margin-top:11px; color:var(--muted); font-size:11px; }.font-size-panel slider { margin:12px 0 3px; }
@keyframes reader-panel-in { from { opacity:0; transform:translateY(-7px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
.reader-layout { height:calc(100vh - var(--status-bar-height) - 64px); display:grid; grid-template-columns:minmax(230px,270px) minmax(0,1fr); }
.reader-toc { display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--line); background:var(--surface); }.toc-head { display:flex; justify-content:space-between; padding:24px 23px 13px; color:var(--muted); font-size:11px; letter-spacing:.1em; }.toc-head>view { display:none; }.toc-scroll { flex:1; min-height:0; }.toc-group { padding:9px 15px; }.toc-chapter { padding:9px 10px; font-size:13px; font-weight:650; }.toc-article,.toc-page { padding:10px 12px; border-radius:10px; color:var(--muted); font-size:12px; transition:background .2s ease,color .2s ease; }.toc-article { margin-left:12px; }.toc-page { margin:2px 15px; }.toc-article.current,.toc-page.current { background:var(--accent-soft); color:var(--accent); font-weight:650; }
.reader-content { height:100%; min-width:0; }.reader-top-anchor { height:1px; }.reader-loading,.reader-error { padding:80px 25px; text-align:center; color:var(--muted); font-size:14px; }.reader-error { color:var(--danger); }
.reading-sheet { width:min(100%,780px); min-height:100%; box-sizing:border-box; margin:0 auto; padding:52px clamp(25px,7vw,80px) 90px; background:var(--surface); }.chapter-kicker { color:var(--muted); font-size:13px; text-align:center; letter-spacing:.08em; }.section-title { margin:28px 0 42px; text-align:center; font-size:27px; font-weight:650; }.read-block { color:var(--text); font-family:var(--reading-font); font-size:var(--reading-size); line-height:1.9; }.read-block.paragraph { margin:0 0 12px; text-indent:2em; white-space:pre-wrap; overflow-wrap:anywhere; }.read-block.heading { margin:24px 0 16px; font-weight:700; }.read-block.image { margin:28px 0; text-align:center; }.read-block.image image { display:block; width:100%; max-width:100%; max-height:70vh; margin:auto; object-fit:contain; }.section-end { margin:65px 0 0; text-align:center; font-size:11px; color:var(--muted); }
.opening-cover { display:flex; align-items:center; justify-content:center; gap:24px; margin:0 0 55px; padding-bottom:45px; border-bottom:1px solid var(--line); }.opening-cover image { width:112px; height:155px; border-radius:8px; box-shadow:0 12px 25px var(--shadow); }.opening-cover>view { display:flex; flex-direction:column; gap:10px; }.opening-cover strong { font-size:22px; }.opening-cover text { color:var(--muted); font-size:12px; }
.pdf-stage { display:flex; flex-direction:column; align-items:center; padding:22px 18px 50px; }.pdf-page { display:block; width:min(100%,900px); background:#fff; box-shadow:0 12px 38px var(--shadow); }.pdf-retry { color:var(--accent); }.page-label { margin:20px; color:var(--muted); font-size:12px; }.toc-backdrop { display:none; }
@media (max-width:760px) { .reader-header { padding:0 14px; gap:7px; }.back-action { min-width:28px; }.back-action text { display:none; }.header-actions { gap:2px; }.toc-button { padding:7px; }.toc-button text { display:none; }.font-size-panel { right:10px; }.reader-layout { display:block; }.reader-toc { position:fixed; z-index:12; left:0; top:var(--status-bar-height); bottom:0; width:min(330px,86vw); transform:translateX(-110%); box-shadow:14px 0 40px var(--shadow); transition:transform .28s cubic-bezier(.2,.8,.2,1); }.reader-toc.open { transform:translateX(0); }.toc-head>view { display:block; font-size:22px; }.toc-backdrop { display:block; position:fixed; z-index:11; inset:0; background:rgba(7,10,18,.43); }.reader-content { height:calc(100vh - var(--status-bar-height) - 64px); }.reading-sheet { padding:37px 24px 75px; }.opening-cover { flex-direction:column; text-align:center; } }
@media (prefers-reduced-motion:reduce) { .reader-toc,.toc-article,.toc-page,.page-control,.font-button,.pinch-lock,.lock-icon::before { transition:none; animation:none; }.font-size-panel { animation:none; } }
</style>
