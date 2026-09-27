<template>
  <view class="image-export" :class="themeClass()">
    <view class="export-shell">
      <view class="export-top"><view class="export-back" @tap="back">‹　返回书本</view><view class="export-step">纸间 / 图片导出</view></view>
      <view class="export-heading"><view class="eyebrow">文字卡片</view><view class="page-title">把一段文字，分享出去。</view><view class="subtle">选择一篇正文中的连续文字，调整样式后生成 PNG。</view></view>
      <view class="export-grid"><view class="export-controls">
        <view class="export-card"><view class="card-label">01 / 选择正文</view><picker mode="selector" :range="articleLabels" :value="articleIndex" @change="chooseArticle"><view class="article-picker">{{ articleLabels[articleIndex] || '这本书还没有正文' }}<text>⌄</text></view></picker></view>
        <view class="export-card"><view class="card-label">02 / 选取文字</view><view class="card-help">长按正文选择文字；也可拖动起止滑块精确调整。</view><textarea v-if="currentArticle" class="selection-source" :value="articleText" maxlength="-1" :selection-start="-1" :selection-end="-1" @longpress="captureSelection" @touchend="captureSelection" /><view v-else class="card-help">请先在书本中创建正文。</view><view class="range-label">从第 {{ start }} 字到第 {{ end }} 字 · 已选 {{ selectedText.length }} 字</view><slider :value="start" :min="0" :max="articleText.length" activeColor="#536787" @changing="setStart" @change="setStart" /><slider :value="end" :min="0" :max="articleText.length" activeColor="#536787" @changing="setEnd" @change="setEnd" /><view class="selection-confirm" @tap="captureSelection">使用当前文字选区</view></view>
        <view class="export-card"><view class="card-label">03 / 图片样式</view><view class="style-row"><view :class="{ selected: style === 'light' }" @tap="style = 'light'">浅色纸张</view><view :class="{ selected: style === 'dark' }" @tap="style = 'dark'">深色纸张</view></view><view class="book-info-option" @tap="showBookInfo = !showBookInfo"><view><text>左上角显示书本信息</text><small>书名 · 作者 · 篇名</small></view><view class="setting-toggle" :class="{ on: showBookInfo }"><view></view></view></view></view>
        <view class="export-actions"><view @tap="exportImage('save')">{{ working ? '正在生成…' : '保存 PNG' }}</view><view @tap="exportImage('share')">分享图片 ↗</view></view><view class="export-note">分享时会打开系统分享面板，可选择设备上可用的 QQ、微信等应用。</view>
      </view><view class="preview-column"><view class="preview-title">图片预览 <text>所选文字会高亮显示</text></view><view class="preview-paper" :class="style"><view v-if="showBookInfo" class="preview-book">{{ book?.title }} <text>· {{ book?.author || '佚名' }} · {{ currentArticle?.title || '无题正文' }}</text></view><view class="preview-text"><text>{{ articleText.slice(Math.max(0, start - 80), start) }}</text><text class="selected-text">{{ selectedText || '拖动滑块或长按正文，选择想分享的文字。' }}</text><text>{{ articleText.slice(end, end + 80) }}</text></view><view class="preview-mark">纸间 <text>· PAPERWRITER</text></view></view></view></view>
    </view>
    <canvas canvas-id="writer-image-export" class="export-canvas" :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"></canvas>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getBook } from '../../src/store/library'
import { themeClass } from '../../src/store/preferences'
import { layoutImageText, paintTextImage } from '../../src/services/image-export'

const instance = getCurrentInstance()
const bookId = ref(''), articleIndex = ref(0), start = ref(0), end = ref(0), style = ref('light'), showBookInfo = ref(false), working = ref(false)
const canvasWidth = ref(1080), canvasHeight = ref(500)
onLoad(options => { bookId.value = options.bookId || ''; const text = articleText.value; end.value = Math.min(text.length, 180) })
const book = computed(() => getBook(bookId.value))
const entries = computed(() => book.value?.chapters.flatMap(chapter => chapter.articles.map(article => ({ chapter, article }))) || [])
const articleLabels = computed(() => entries.value.map(({ chapter, article }) => `${chapter.title} / ${article.title || '无题正文'}`))
const currentArticle = computed(() => entries.value[articleIndex.value]?.article)
const articleText = computed(() => currentArticle.value?.paragraphs.join('\n') || '')
const selectedText = computed(() => articleText.value.slice(start.value, end.value))
function back() { uni.navigateBack() }
function chooseArticle(event) { articleIndex.value = Number(event.detail.value) || 0; start.value = 0; end.value = Math.min(articleText.value.length, 180) }
function setStart(event) { start.value = Math.min(Number(event.detail.value) || 0, end.value) }
function setEnd(event) { end.value = Math.max(start.value, Number(event.detail.value) || 0) }
function captureSelection() {
  if (typeof uni.getSelectedTextRange !== 'function') return
  setTimeout(() => uni.getSelectedTextRange({ success: range => {
    if (Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start) { start.value = range.start; end.value = range.end }
  } }), 80)
}
function createPng() {
  return new Promise((resolve, reject) => {
    const ctx = uni.createCanvasContext('writer-image-export', instance.proxy)
    const layout = layoutImageText(ctx, selectedText.value, showBookInfo.value ? `${book.value.title} · ${book.value.author || '佚名'} · ${currentArticle.value?.title || '无题正文'}` : '')
    canvasHeight.value = layout.height
    // Canvas must receive its new dimensions before painting on App WebView.
    setTimeout(() => {
      try {
        paintTextImage(ctx, layout, style.value)
        ctx.draw(false, () => uni.canvasToTempFilePath({ canvasId: 'writer-image-export', fileType: 'png', width: canvasWidth.value, height: canvasHeight.value, destWidth: canvasWidth.value, destHeight: canvasHeight.value, success: result => resolve(result.tempFilePath), fail: error => reject(new Error(error.errMsg || '生成 PNG 失败')) }, instance.proxy))
      } catch (error) { reject(error) }
    }, 40)
  })
}
async function exportImage(action) {
  if (working.value) return
  if (!selectedText.value.trim()) return uni.showToast({ title: '请先选择文字', icon: 'none' })
  working.value = true
  try {
    const path = await createPng()
    if (action === 'share') {
      uni.shareWithSystem({ type: 'image', imageUrl: path, fail: () => shareFromAlbum(path) })
    } else await new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject }))
    if (action === 'save') uni.showToast({ title: '图片已保存到相册', icon: 'none' })
  } catch (error) { uni.showToast({ title: error.message || error.errMsg || '导出失败', icon: 'none' }) }
  finally { working.value = false }
}
async function shareFromAlbum(path) {
  try {
    await new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject }))
    uni.showToast({ title: '请在相册中选择刚保存的图片', icon: 'none' })
    uni.chooseImage({ count: 1, sourceType: ['album'], sizeType: ['original'], success: result => {
      const selected = result.tempFilePaths?.[0]
      if (selected) uni.shareWithSystem({ type: 'image', imageUrl: selected, fail: () => uni.showToast({ title: '分享失败，可在相册中直接分享', icon: 'none' }) })
    } })
  } catch (error) { uni.showToast({ title: error.errMsg || '无法保存到相册', icon: 'none' }) }
}
</script>

<style scoped>
.image-export { min-height:100vh; padding:calc(var(--status-bar-height) + 24px) 24px 70px; background:var(--bg); color:var(--text); }.export-shell { max-width:1200px; margin:0 auto; }.export-top { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; }.export-back { color:var(--accent); font-size:14px; }.export-heading { margin:48px 0 32px; }.export-heading .page-title { margin:9px 0; }.export-grid { display:grid; grid-template-columns:minmax(0,510px) minmax(0,1fr); gap:34px; }.export-controls { min-width:0; }.export-card { margin-bottom:15px; padding:22px; border:1px solid var(--line); border-radius:20px; background:var(--surface); box-shadow:0 12px 30px var(--shadow); }.card-label { color:var(--accent); font-size:11px; font-weight:700; letter-spacing:.1em; margin-bottom:17px; }.card-help { color:var(--muted); font-size:12px; line-height:1.6; margin-bottom:12px; }.article-picker { display:flex; justify-content:space-between; padding:12px 14px; border-radius:11px; background:var(--surface-alt); font-size:13px; }.selection-source { width:100%; height:145px; padding:12px; border:1px solid var(--line); border-radius:11px; color:var(--text); background:var(--surface-alt); font-size:13px; line-height:1.65; }.range-label { margin:15px 0 4px; color:var(--muted); font-size:11px; }.selection-confirm { display:inline-block; margin-top:7px; padding:8px 12px; border-radius:9px; color:var(--accent); background:var(--accent-soft); font-size:11px; }.style-row { display:flex; gap:10px; }.style-row view { flex:1; padding:12px; border-radius:12px; border:1px solid var(--line); background:var(--surface-alt); text-align:center; font-size:12px; }.style-row view.selected { color:var(--accent); border-color:var(--accent); background:var(--accent-soft); }.book-info-option { display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:12px; }.book-info-option small { display:block; margin-top:6px; color:var(--muted); font-size:10px; }.setting-toggle { width:40px; height:24px; padding:3px; border-radius:14px; background:var(--line); transition:background .2s; }.setting-toggle>view { width:18px; height:18px; border-radius:50%; background:#fff; transition:transform .2s; }.setting-toggle.on { background:var(--accent); }.setting-toggle.on>view { transform:translateX(16px); }.export-actions { display:flex; gap:10px; }.export-actions view { flex:1; padding:14px; border-radius:13px; background:var(--accent); color:#fff; text-align:center; font-size:13px; font-weight:650; }.export-actions view:last-child { background:var(--accent-soft); color:var(--accent); }.export-note { margin-top:12px; color:var(--muted); font-size:11px; line-height:1.5; }.preview-title { display:flex; justify-content:space-between; margin:2px 0 16px; font-size:13px; font-weight:650; }.preview-title text { color:var(--muted); font-size:11px; font-weight:400; }.preview-paper { position:sticky; top:25px; min-height:450px; padding:46px; border-radius:8px; box-shadow:0 18px 60px var(--shadow); display:flex; flex-direction:column; }.preview-paper.light { background:#fbfaf7; color:#252a32; }.preview-paper.dark { background:#171b24; color:#f1f0eb; }.preview-book { font-size:12px; opacity:.56; margin-bottom:35px; }.preview-text { flex:1; font-size:19px; line-height:1.9; white-space:pre-wrap; overflow-wrap:anywhere; }.preview-text>text:not(.selected-text) { opacity:.18; }.selected-text { border-radius:4px; background:rgba(101,130,177,.25); }.preview-mark { text-align:right; font-size:16px; font-weight:700; }.preview-mark text { font-size:9px; font-weight:400; letter-spacing:.1em; opacity:.6; }.export-canvas { position:fixed; left:-12000px; top:0; pointer-events:none; }@media(max-width:760px){ .export-grid { grid-template-columns:1fr; }.export-heading { margin:30px 0; }.preview-paper { position:static; padding:30px; min-height:320px; }.image-export { padding-left:16px; padding-right:16px; } }
</style>
