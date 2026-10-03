<template>
  <view class="image-export" :class="themeClass()">
    <view class="export-shell">
      <view class="export-top"><view class="back" @tap="back">{{ $t('‹　返回') }}</view><text>{{ $t('纸间 / 图片导出') }}</text></view>
      <view class="heading"><text class="eyebrow">{{ $t('文字卡片') }}</text><view class="page-title">{{ $t('分享一段好文字。') }}</view><text class="hint">{{ $t('从正文截取连续文字，制成可保存、可分享的 PNG 图片。') }}</text></view>
      <view v-if="!book" class="empty-card">{{ $t('找不到这本书。请返回书架后重新进入。') }}</view>
      <view v-else class="export-grid">
        <view class="controls">
          <view class="step-card">
            <view class="step-head"><text class="step-number">01</text><view><view class="step-title">{{ $t('选择正文') }}</view><text class="step-detail">{{ source === 'selection' ? $t('来自编辑器的选区') : $t('从这本书挑选一篇') }}</text></view></view>
            <view v-if="!entries.length" class="empty-state">{{ $t('这本书还没有正文，请先创建一篇正文。') }}</view>
            <view v-else class="article-choice" @tap="articleListOpen = !articleListOpen"><view><text>{{ currentEntry?.article.title || $t('无题正文') }}</text><small>{{ currentEntry?.chapter.title }}</small></view><text class="choice-chevron" :class="{ open: articleListOpen }">⌄</text></view>
            <view v-if="articleListOpen" class="article-list"><view v-for="(entry, index) in entries" :key="entry.article.id" class="article-option" :class="{ active: articleIndex === index }" @tap="chooseArticle(index)"><text>{{ entry.chapter.title }}</text><view>{{ entry.article.title || $t('无题正文') }}</view><small>{{ entry.article.paragraphs.join('').length }} {{ $t('字') }}</small></view></view>
          </view>
          <view v-if="currentEntry" class="step-card">
            <view class="step-head"><text class="step-number">02</text><view><view class="step-title">{{ $t('选取文字') }}</view><text class="step-detail">{{ $t('只导出高亮的连续内容 ·') }} {{ selectedText.length }} {{ $t('字') }}</text></view></view>
            <view class="selection-help">{{ $t('长按下方正文选择文字；也可调整起点与终点。选区会实时显示在右侧预览中。') }}</view>
            <ReadonlyTextSelection ref="sourceText" :value="articleText" @selection="setSelection" />
            <view class="selection-toolbar"><view @touchstart="captureSelection" @tap="captureSelection">{{ $t('使用文字选区') }}</view><text v-if="articleText.length">{{ $t('第') }} {{ start + 1 }} {{ $t('至') }} {{ end }} {{ $t('字 / 共') }} {{ articleText.length }} {{ $t('字') }}</text><text v-else>{{ $t('这篇正文没有文字') }}</text></view>
            <TextRangeSlider :length="articleText.length" :start="start" :end="end" @change="setSelection" />
            <view class="selected-strip"><text>{{ $t('已选文字') }}</text><view>{{ selectedText || $t('请先选择一段正文文字') }}</view></view>
          </view>
          <view v-if="currentEntry" class="step-card">
            <view class="step-head"><text class="step-number">03</text><view><view class="step-title">{{ $t('图片样式') }}</view><text class="step-detail">{{ $t('书本信息默认不展示') }}</text></view></view>
            <view class="style-options"><view :class="{ active: style === 'light' }" @tap="style = 'light'">{{ $t('☼　浅色纸张') }}</view><view :class="{ active: style === 'dark' }" @tap="style = 'dark'">{{ $t('☾　深色纸张') }}</view></view>
            <view class="background-control">
              <view class="background-heading"><text>{{ $t('背景图片') }}</text><button v-if="backgroundImage" class="background-remove" :disabled="working || backgroundBusy" @tap="removeBackground">{{ $t('移除图片') }}</button></view>
              <button class="background-pick" :disabled="working || backgroundBusy" @tap="chooseBackground">
                <image v-if="backgroundImage" class="background-thumbnail" :src="backgroundImage.path" mode="aspectFill" />
                <UiIcon v-else name="image" />
                <text>{{ backgroundBusy ? $t('正在读取图片…') : backgroundImage ? $t('更换图片') : $t('选择背景图片') }}</text>
              </button>
              <view v-if="backgroundImage" class="background-transparency">
                <view class="background-heading"><text>{{ $t('图片透明度') }}</text><text class="transparency-value">{{ backgroundTransparency }}%</text></view>
                <slider :value="backgroundTransparency" :min="0" :max="100" :step="1" :block-size="22" :disabled="working" activeColor="#5774a0" backgroundColor="#b6c1d033" @changing="changeTransparency" @change="changeTransparency" />
                <view class="transparency-labels"><text>{{ $t('不透明') }}</text><text>{{ $t('完全透明') }}</text></view>
                <text class="background-help">{{ $t('图片居中铺满，透明度仅影响背景图片。') }}</text>
              </view>
            </view>
            <view class="info-option" @tap="showBookInfo = !showBookInfo"><view><view>{{ $t('左上角添加书本信息') }}</view><text>{{ $t('书名 · 作者 · 篇名') }}</text></view><view class="toggle" :class="{ on: showBookInfo }"><view /></view></view>
          </view>
          <view v-if="currentEntry" class="actions"><view class="primary" :class="{ busy: working, disabled: saving }" @tap="generate">{{ working ? $t('正在生成…') : generatedPath ? $t('重新生成 PNG') : $t('生成 PNG') }}</view><view :class="{ disabled: !generatedPath || working || saving }" @tap="saveImage">{{ saving ? $t('保存中…') : $t('保存到相册') }}</view><view :class="{ disabled: !generatedPath }" @tap="shareImage">{{ $t('打开并分享 ↗') }}</view></view>
          <view v-if="errorMessage" class="error-message">{{ $m(errorMessage) }}</view>
          <view class="note">{{ $t('生成后可先检查图片，再保存或分享到系统中可用的应用。') }}</view>
        </view>
        <view v-if="currentEntry" class="preview-column">
          <view class="preview-label">{{ generatedPath ? $t('已生成 · PNG') : $t('实时预览') }}<text>{{ style === 'dark' ? $t('深色') : $t('浅色') }}</text></view>
          <image v-if="generatedPath || previewPath" class="generated-image" :src="generatedPath || previewPath" mode="widthFix" />
          <view v-else class="preview-placeholder" :class="style" @tap="refreshPreview">
            <text>{{ previewError ? $m(previewError) : selectedText.trim() ? $t('正在更新预览…') : $t('请先选择一段正文文字') }}</text>
            <text v-if="previewError">{{ $t('预览失败，点选重试') }}</text>
          </view>
        </view>
      </view>
    </view>
    <canvas canvas-id="writer-image-export" id="writer-image-export" class="export-canvas" :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"></canvas>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import { getBook } from '../../src/store/library'
import { takeImageExport } from '../../src/store/image-export-draft'
import { loadPreferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import { createTextPng } from '../../src/services/image-export'
import { chooseBackgroundImage } from '../../src/services/image-picker.js'
import { mirrorExport } from '../../src/services/data-directory.js'
import { textOnlyParagraphs } from '../../src/utils/media'
import { t } from '../../src/i18n.js'
import TextRangeSlider from '../../components/TextRangeSlider.vue'
import ReadonlyTextSelection from '../../components/ReadonlyTextSelection.vue'
import UiIcon from '../../components/UiIcon.vue'
import { textRange } from '../../src/utils/text-range.js'

const instance = getCurrentInstance()
const prefs = loadPreferences()
const bookId = ref(''), source = ref('book'), articleIndex = ref(0), articleListOpen = ref(false)
const start = ref(0), end = ref(0), style = ref('light'), showBookInfo = ref(false)
const backgroundImage = ref(null), backgroundTransparency = ref(70), backgroundBusy = ref(false)
const backgroundOpacity = computed(() => 1 - backgroundTransparency.value / 100)
const sourceText = ref(null)
const working = ref(false), generatedPath = ref(''), savedPath = ref(''), errorMessage = ref('')
const previewPath = ref(''), previewError = ref(''), saving = ref(false)
const canvasWidth = ref(1080), canvasHeight = ref(460)
const book = computed(() => getBook(bookId.value))
const entries = computed(() => book.value?.chapters.flatMap(chapter => chapter.articles.map(article => ({ chapter, article }))) || [])
const currentEntry = computed(() => entries.value[articleIndex.value])
const articleText = computed(() => textOnlyParagraphs(currentEntry.value?.article.paragraphs).join('\n'))
const selectedText = computed(() => articleText.value.slice(start.value, end.value))
let settingsRevision = 0, disposed = false, ready = false, previewTimer, renderTask, renderingBackground = ''
let fontReady = Promise.resolve()
const retiredBackgrounds = new Set(), retainedPngs = new Set(), retiredPngs = new Set()

onLoad(options => {
  fontReady = loadSelectedFont().catch(() => {})
  bookId.value = options.bookId || ''
  source.value = options.source || 'book'
  if (source.value === 'selection') {
    const draft = takeImageExport()
    if (draft?.bookId === bookId.value) {
      const index = entries.value.findIndex(entry => entry.article.id === draft.articleId && entry.chapter.id === draft.chapterId)
      if (index >= 0) {
        articleIndex.value = index
        const text = articleText.value
        const begin = Math.max(0, Math.min(text.length, Number(draft.start) || 0))
        const finish = Math.max(begin, Math.min(text.length, Number(draft.end) || 0))
        if (text.slice(begin, finish) === draft.text) { start.value = begin; end.value = finish; return }
        const match = text.indexOf(draft.text)
        if (match >= 0) { start.value = match; end.value = match + draft.text.length; return }
      }
    }
    errorMessage.value = t('原选区已变化，请重新选取文字。')
  }
  setSelection(textRange(articleText.value.length))
})

watch([articleIndex, start, end, selectedText, style, showBookInfo, backgroundImage, backgroundTransparency,
  () => book.value?.title, () => book.value?.author, () => currentEntry.value?.article.title, () => prefs.font], () => {
  settingsRevision++; releasePng(previewPath.value)
  previewPath.value = ''; previewError.value = ''; generatedPath.value = ''; savedPath.value = ''; errorMessage.value = ''
  schedulePreview()
}, { flush: 'sync' })
function releaseImage(image) {
  if (!image?.path) return
  if (image.path === renderingBackground) retiredBackgrounds.add(image.path)
  else uni.removeSavedFile({ filePath: image.path, fail: () => {} })
}
function releaseBackground() { releaseImage(backgroundImage.value); backgroundImage.value = null }
function releasePng(path) {
  if (!path) return
  if (retainedPngs.has(path)) { retiredPngs.add(path); return }
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined') plus.io.resolveLocalFileSystemURL(path, entry => entry.remove(() => {}, () => {}), () => {})
  // #endif
}
function finishUsingPng(path) {
  retainedPngs.delete(path)
  if (retiredPngs.delete(path)) releasePng(path)
}
onReady(() => { ready = true; schedulePreview() })
onUnload(() => {
  disposed = true; clearTimeout(previewTimer); releasePng(previewPath.value)
  previewPath.value = ''; generatedPath.value = ''; releaseBackground()
})
async function chooseBackground() {
  if (working.value || backgroundBusy.value || disposed) return
  backgroundBusy.value = true; errorMessage.value = ''
  try {
    const image = await chooseBackgroundImage()
    if (disposed) { releaseImage(image); return }
    releaseImage(backgroundImage.value); backgroundImage.value = image
  } catch (error) {
    if (!disposed && !/取消|cancel/i.test(String(error.message))) errorMessage.value = error.message || t('无法读取图片')
  } finally { backgroundBusy.value = false }
}
function removeBackground() { if (!working.value && !backgroundBusy.value) releaseBackground() }
function changeTransparency(event) {
  if (working.value) return
  const value = Number(event.detail?.value)
  if (Number.isFinite(value)) backgroundTransparency.value = Math.max(0, Math.min(100, Math.round(value)))
}
function back() { uni.navigateBack() }
function chooseArticle(index) { articleIndex.value = index; source.value = 'book'; setSelection(textRange(articleText.value.length)); articleListOpen.value = false }
function setSelection(range) { const selected = textRange(articleText.value.length, range.start, range.end); start.value = selected.start; end.value = selected.end }
function captureSelection() { sourceText.value?.captureSelection() }
async function renderPng() {
  const info = showBookInfo.value ? `${book.value.title} · ${book.value.author || t('佚名')} · ${currentEntry.value.article.title || t('无题正文')}` : ''
  return createTextPng({ canvasId: 'writer-image-export', instance: instance.proxy, text: selectedText.value, info, style: style.value, backgroundImage: backgroundImage.value, backgroundOpacity: backgroundOpacity.value, fontFamily: fontFamilyFor(prefs.font),
    resize: layout => { canvasWidth.value = layout.width; canvasHeight.value = layout.height }, nextFrame: nextTick })
}
function schedulePreview() {
  clearTimeout(previewTimer)
  if (ready && !disposed && selectedText.value.trim()) previewTimer = setTimeout(refreshPreview, 200)
}
async function refreshPreview() {
  clearTimeout(previewTimer)
  if (disposed || !selectedText.value.trim()) return ''
  // All renders share one canvas. Wait for an older render before starting the latest settings.
  if (renderTask) { await renderTask; return refreshPreview() }
  if (previewPath.value) return previewPath.value
  const revision = settingsRevision
  renderingBackground = backgroundImage.value?.path || ''
  const task = (async () => {
    try {
      await fontReady
      if (disposed || revision !== settingsRevision) return ''
      const path = await renderPng()
      if (disposed || revision !== settingsRevision) { releasePng(path); return '' }
      previewPath.value = path; previewError.value = ''
      return path
    } catch (error) {
      if (!disposed && revision === settingsRevision) previewError.value = error.message || t('图片生成失败')
      return ''
    } finally {
      renderingBackground = ''
      for (const path of retiredBackgrounds) uni.removeSavedFile({ filePath: path, fail: () => {} })
      retiredBackgrounds.clear()
    }
  })()
  renderTask = task
  try { return await task }
  finally { if (renderTask === task) renderTask = null }
}
async function generate() {
  if (working.value || saving.value || backgroundBusy.value || disposed) return
  const revision = settingsRevision
  let path = ''
  working.value = true; errorMessage.value = ''
  try {
    path = await refreshPreview()
    if (disposed || revision !== settingsRevision) return
    if (!path) throw new Error(previewError.value || t('请先选择文字'))
    if (generatedPath.value !== path) savedPath.value = ''
    generatedPath.value = path
    retainedPngs.add(path)
    try { await mirrorExport(path, 'png') }
    catch (copyError) { if (!disposed && revision === settingsRevision) errorMessage.value = t('图片已生成，但复制到数据目录失败：{error}', { error:copyError.message || copyError }) }
  }
  catch (error) { if (!disposed && revision === settingsRevision) { generatedPath.value = ''; errorMessage.value = error.message || t('图片生成失败') } }
  finally { finishUsingPng(path); working.value = false }
}
function ensureAlbumCopy(path) {
  if (savedPath.value) return Promise.resolve(savedPath.value)
  return new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: path,
    success: result => { const saved = result.path || path; if (!disposed && generatedPath.value === path) savedPath.value = saved; resolve(saved) },
    fail: error => reject(new Error(error?.errMsg || t('无法保存到相册')))
  }))
}
async function saveImage() {
  if (!generatedPath.value || working.value || saving.value || disposed) return
  const path = generatedPath.value
  saving.value = true; errorMessage.value = ''; retainedPngs.add(path)
  try { await ensureAlbumCopy(path); if (!disposed) uni.showToast({ title: t('图片已保存到相册'), icon: 'none' }) }
  catch (error) { if (!disposed && generatedPath.value === path) errorMessage.value = error.message }
  finally { finishUsingPng(path); saving.value = false }
}
async function shareImage() {
  if (!generatedPath.value) return
  // #ifdef APP-PLUS
  try { plus.runtime.openFile(generatedPath.value, {}, error => { errorMessage.value = t('{error}。可以先保存到相册再分享。', { error:error?.message || t('无法打开图片') }) }) }
  catch (error) { errorMessage.value = error.message || t('无法打开图片') }
  // #endif
  // #ifndef APP-PLUS
  errorMessage.value = t('请在 Android App 中打开图片')
  // #endif
}
</script>

<style scoped>
.image-export { min-height:100vh; padding:calc(var(--status-bar-height) + 24px) 20px 70px; background:var(--bg); color:var(--text); }.export-shell { max-width:1220px; margin:auto; }.export-top { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; }.back { color:var(--accent); font-size:14px; }.heading { margin:38px 0 30px; }.eyebrow { color:var(--accent); font-size:11px; letter-spacing:.15em; }.page-title { font-size:clamp(27px,4vw,43px); font-weight:750; margin:10px 0; }.hint { color:var(--muted); font-size:13px; line-height:1.7; }.export-grid { display:grid; grid-template-columns:minmax(0,540px) minmax(0,1fr); gap:28px; align-items:start; }.controls { min-width:0; }.step-card,.empty-card { padding:22px; border:1px solid var(--line); border-radius:20px; background:var(--surface); box-shadow:0 10px 32px var(--shadow); margin-bottom:14px; }.step-head { display:flex; gap:15px; align-items:start; margin-bottom:18px; }.step-number { display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:10px; background:var(--accent-soft); color:var(--accent); font-size:12px; font-weight:700; }.step-title { font-size:16px; font-weight:700; }.step-detail { display:block; margin-top:5px; color:var(--muted); font-size:11px; }.empty-state,.selection-help { color:var(--muted); font-size:12px; line-height:1.7; }.article-choice { display:flex; justify-content:space-between; align-items:center; padding:13px 15px; background:var(--surface-alt); border-radius:12px; }.article-choice view { display:flex; flex-direction:column; gap:3px; font-size:13px; font-weight:650; }.article-choice small { color:var(--muted); font-size:10px; font-weight:400; }.choice-chevron { color:var(--accent); font-size:20px; transition:transform .25s; }.choice-chevron.open { transform:rotate(180deg); }.article-list { margin-top:8px; max-height:210px; overflow:auto; animation:slide-in .2s ease; }.article-option { display:flex; align-items:center; gap:10px; padding:11px; border-radius:9px; font-size:12px; }.article-option.active { color:var(--accent); background:var(--accent-soft); }.article-option text { color:var(--muted); font-size:10px; }.article-option view { flex:1; }.article-option small { color:var(--muted); font-size:10px; }.selection-toolbar { display:flex; justify-content:space-between; gap:10px; align-items:center; margin:12px 0; font-size:10px; color:var(--muted); }.selection-toolbar view { color:var(--accent); background:var(--accent-soft); padding:8px 10px; border-radius:8px; font-size:11px; }.selected-strip { margin-top:14px; border-left:3px solid var(--accent); border-radius:5px; padding:7px 11px; background:var(--accent-soft); }.selected-strip text { color:var(--accent); font-size:10px; }.selected-strip view { max-height:95px; overflow:auto; white-space:pre-wrap; font-size:12px; line-height:1.7; margin-top:5px; }.style-options { display:flex; gap:9px; }.style-options view { flex:1; padding:12px 7px; border:1px solid var(--line); border-radius:11px; background:var(--surface-alt); text-align:center; font-size:12px; }.style-options view.active { color:var(--accent); background:var(--accent-soft); border-color:var(--accent); }.info-option { display:flex; align-items:center; justify-content:space-between; margin-top:19px; font-size:12px; }.info-option text { display:block; color:var(--muted); font-size:10px; margin-top:5px; }.toggle { width:40px; height:24px; padding:3px; box-sizing:border-box; background:var(--line); border-radius:20px; transition:background .2s; }.toggle view { width:18px; height:18px; border-radius:50%; background:white; transition:transform .2s; }.toggle.on { background:var(--accent); }.toggle.on view { transform:translateX(16px); }.actions { display:flex; gap:8px; flex-wrap:wrap; }.actions view { flex:1; min-width:115px; padding:13px 8px; border:1px solid var(--line); background:var(--surface); border-radius:12px; text-align:center; font-size:12px; font-weight:650; }.actions .primary { color:white; background:var(--accent); border-color:var(--accent); }.actions .disabled { opacity:.45; }.actions .busy { opacity:.7; }.error-message { padding:12px; margin-top:12px; border-radius:10px; background:rgba(196,74,74,.1); color:#aa5050; font-size:12px; }.note { color:var(--muted); font-size:11px; margin-top:12px; line-height:1.6; }.preview-label { display:flex; justify-content:space-between; font-size:12px; font-weight:650; margin:4px 0 16px; }.preview-label text { color:var(--muted); font-weight:400; }.generated-image { display:block; width:100%; box-sizing:border-box; box-shadow:0 20px 60px var(--shadow); border-radius:8px; }.preview-placeholder { min-height:190px; padding:30px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; border-radius:8px; font-size:12px; line-height:1.7; text-align:center; }.preview-placeholder.light { background:#fbfaf7; color:#536787; }.preview-placeholder.dark { background:#171b24; color:#879fbe; }.export-canvas { position:fixed; top:0; left:0; opacity:.001; z-index:-1; pointer-events:none; }@keyframes slide-in { from { opacity:0; transform:translateY(-5px); } }@media(max-width:820px){ .export-grid { grid-template-columns:1fr; }.heading { margin:28px 0; } }
.export-shell { position:relative; z-index:1; }
.export-canvas { z-index:0; }
.background-control { margin-top:19px; padding-top:18px; border-top:1px solid var(--line); }
.background-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:12px; }
.background-remove { margin:0; padding:4px 0; background:transparent; color:var(--muted); font-size:11px; line-height:1.5; }
.background-pick { display:flex; align-items:center; justify-content:center; gap:12px; width:100%; min-height:64px; margin-top:10px; padding:10px 14px; border:1px dashed var(--line); border-radius:11px; background:var(--surface-alt); color:var(--accent); font-size:12px; line-height:1.5; }
.background-pick::after,.background-remove::after { border:none; }
.background-pick[disabled],.background-remove[disabled] { opacity:.5; }
.background-pick:focus-visible,.background-remove:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.background-thumbnail { display:block; width:54px; height:44px; border-radius:6px; flex-shrink:0; }
.background-transparency { margin-top:17px; }
.transparency-value { color:var(--accent); font-variant-numeric:tabular-nums; }
.background-transparency slider { margin:15px 0 7px; }
.transparency-labels { display:flex; justify-content:space-between; color:var(--muted); font-size:10px; }
.background-help { display:block; margin-top:12px; color:var(--muted); font-size:11px; line-height:1.6; }
</style>
