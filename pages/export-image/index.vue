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
            <textarea class="source-text" :value="articleText" :maxlength="-1" :auto-height="false" @longpress="captureSelection" @touchend="captureSelection" />
            <view class="selection-toolbar"><view @touchstart="captureSelection" @tap="captureSelection">{{ $t('使用文字选区') }}</view><text>{{ $t('第') }} {{ start + 1 }} {{ $t('至') }} {{ end }} {{ $t('字 / 共') }} {{ articleText.length }} {{ $t('字') }}</text></view>
            <view class="range-row"><text>{{ $t('起点') }}</text><slider :value="start" :min="0" :max="Math.max(1, articleText.length)" activeColor="#536787" backgroundColor="#e4e9f1" @changing="setStart" @change="setStart" /><input type="number" :value="start" @blur="inputStart" /></view>
            <view class="range-row"><text>{{ $t('终点') }}</text><slider :value="end" :min="0" :max="Math.max(1, articleText.length)" activeColor="#536787" backgroundColor="#e4e9f1" @changing="setEnd" @change="setEnd" /><input type="number" :value="end" @blur="inputEnd" /></view>
            <view class="selected-strip"><text>{{ $t('已选文字') }}</text><view>{{ selectedText || $t('请先选择一段正文文字') }}</view></view>
          </view>
          <view v-if="currentEntry" class="step-card">
            <view class="step-head"><text class="step-number">03</text><view><view class="step-title">{{ $t('图片样式') }}</view><text class="step-detail">{{ $t('书本信息默认不展示') }}</text></view></view>
            <view class="style-options"><view :class="{ active: style === 'light' }" @tap="style = 'light'">{{ $t('☼　浅色纸张') }}</view><view :class="{ active: style === 'dark' }" @tap="style = 'dark'">{{ $t('☾　深色纸张') }}</view></view>
            <view class="info-option" @tap="showBookInfo = !showBookInfo"><view><view>{{ $t('左上角添加书本信息') }}</view><text>{{ $t('书名 · 作者 · 篇名') }}</text></view><view class="toggle" :class="{ on: showBookInfo }"><view /></view></view>
          </view>
          <view v-if="currentEntry" class="actions"><view class="primary" :class="{ busy: working }" @tap="generate">{{ working ? $t('正在生成…') : generatedPath ? $t('重新生成 PNG') : $t('生成 PNG') }}</view><view :class="{ disabled: !generatedPath }" @tap="saveImage">{{ $t('保存到相册') }}</view><view :class="{ disabled: !generatedPath }" @tap="shareImage">{{ $t('打开并分享 ↗') }}</view></view>
          <view v-if="errorMessage" class="error-message">{{ $m(errorMessage) }}</view>
          <view class="note">{{ $t('生成后可先检查图片，再保存或分享到系统中可用的应用。') }}</view>
        </view>
        <view v-if="currentEntry" class="preview-column"><view class="preview-label">{{ generatedPath ? $t('已生成 · PNG') : $t('实时预览') }}<text>{{ style === 'dark' ? $t('深色') : $t('浅色') }}</text></view><image v-if="generatedPath" class="generated-image" :src="generatedPath" mode="widthFix" /><view v-else class="preview-paper" :class="style" :style="{ fontFamily: fontFamilyFor(prefs.font) }"><view v-if="showBookInfo" class="preview-info">{{ book.title }} · {{ book.author || $t('佚名') }} · {{ currentEntry.article.title || $t('无题正文') }}</view><view class="preview-copy"><text>{{ articleText.slice(Math.max(0, start - 50), start) }}</text><text class="highlight">{{ selectedText || $t('你选中的文字，会显示在这里。') }}</text><text>{{ articleText.slice(end, end + 50) }}</text></view><view class="brand">{{ $t('纸间') }} <text>PAPERWRITER</text></view></view></view>
      </view>
    </view>
    <canvas canvas-id="writer-image-export" id="writer-image-export" class="export-canvas" :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"></canvas>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getBook } from '../../src/store/library'
import { takeImageExport } from '../../src/store/image-export-draft'
import { loadPreferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import { createTextPng } from '../../src/services/image-export'
import { mirrorExport } from '../../src/services/data-directory.js'
import { textOnlyParagraphs } from '../../src/utils/media'
import { t } from '../../src/i18n.js'

const instance = getCurrentInstance()
const prefs = loadPreferences()
const bookId = ref(''), source = ref('book'), articleIndex = ref(0), articleListOpen = ref(false)
const start = ref(0), end = ref(0), style = ref('light'), showBookInfo = ref(false)
const working = ref(false), generatedPath = ref(''), savedPath = ref(''), errorMessage = ref('')
const canvasWidth = ref(1080), canvasHeight = ref(460)
const book = computed(() => getBook(bookId.value))
const entries = computed(() => book.value?.chapters.flatMap(chapter => chapter.articles.map(article => ({ chapter, article }))) || [])
const currentEntry = computed(() => entries.value[articleIndex.value])
const articleText = computed(() => textOnlyParagraphs(currentEntry.value?.article.paragraphs).join('\n'))
const selectedText = computed(() => articleText.value.slice(start.value, end.value))

onLoad(options => {
  loadSelectedFont().catch(() => {})
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
  end.value = 0
})

watch([articleIndex, start, end, style, showBookInfo], () => { generatedPath.value = ''; savedPath.value = ''; errorMessage.value = '' })
function back() { uni.navigateBack() }
function chooseArticle(index) { articleIndex.value = index; source.value = 'book'; start.value = 0; end.value = 0; articleListOpen.value = false }
function clamp(value) { return Math.max(0, Math.min(articleText.value.length, Math.floor(Number(value) || 0))) }
function setStart(event) { start.value = Math.min(clamp(event.detail.value), end.value) }
function setEnd(event) { end.value = Math.max(start.value, clamp(event.detail.value)) }
function inputStart(event) { setStart(event) }
function inputEnd(event) { setEnd(event) }
function captureSelection() {
  if (typeof uni.getSelectedTextRange !== 'function') return
  const read = () => { try { uni.getSelectedTextRange({ success: range => {
    const from = clamp(range.start), to = clamp(range.end)
    if (to > from) { start.value = from; end.value = to }
  } }) } catch (_) { /* range sliders remain available */ } }
  read()
  setTimeout(read, 80)
}
async function renderPng() {
  const info = showBookInfo.value ? `${book.value.title} · ${book.value.author || t('佚名')} · ${currentEntry.value.article.title || t('无题正文')}` : ''
  return createTextPng({ canvasId: 'writer-image-export', instance: instance.proxy, text: selectedText.value, info, style: style.value, fontFamily: fontFamilyFor(prefs.font),
    resize: layout => { canvasWidth.value = layout.width; canvasHeight.value = layout.height }, nextFrame: nextTick })
}
async function generate() {
  if (working.value) return
  working.value = true; errorMessage.value = ''
  try {
    generatedPath.value = await renderPng(); savedPath.value = ''
    try { await mirrorExport(generatedPath.value, 'png') }
    catch (copyError) { errorMessage.value = t('图片已生成，但复制到数据目录失败：{error}', { error:copyError.message || copyError }) }
  }
  catch (error) { generatedPath.value = ''; errorMessage.value = error.message || t('图片生成失败') }
  finally { working.value = false }
}
function ensureAlbumCopy() {
  if (savedPath.value) return Promise.resolve(savedPath.value)
  return new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: generatedPath.value,
    success: result => { savedPath.value = result.path || generatedPath.value; resolve(savedPath.value) },
    fail: error => reject(new Error(error?.errMsg || t('无法保存到相册')))
  }))
}
async function saveImage() {
  if (!generatedPath.value) return
  try { await ensureAlbumCopy(); uni.showToast({ title: t('图片已保存到相册'), icon: 'none' }) }
  catch (error) { errorMessage.value = error.message }
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
.image-export { min-height:100vh; padding:calc(var(--status-bar-height) + 24px) 20px 70px; background:var(--bg); color:var(--text); }.export-shell { max-width:1220px; margin:auto; }.export-top { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; }.back { color:var(--accent); font-size:14px; }.heading { margin:38px 0 30px; }.eyebrow { color:var(--accent); font-size:11px; letter-spacing:.15em; }.page-title { font-size:clamp(27px,4vw,43px); font-weight:750; margin:10px 0; }.hint { color:var(--muted); font-size:13px; line-height:1.7; }.export-grid { display:grid; grid-template-columns:minmax(0,540px) minmax(0,1fr); gap:28px; align-items:start; }.controls { min-width:0; }.step-card,.empty-card { padding:22px; border:1px solid var(--line); border-radius:20px; background:var(--surface); box-shadow:0 10px 32px var(--shadow); margin-bottom:14px; }.step-head { display:flex; gap:15px; align-items:start; margin-bottom:18px; }.step-number { display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:10px; background:var(--accent-soft); color:var(--accent); font-size:12px; font-weight:700; }.step-title { font-size:16px; font-weight:700; }.step-detail { display:block; margin-top:5px; color:var(--muted); font-size:11px; }.empty-state,.selection-help { color:var(--muted); font-size:12px; line-height:1.7; }.article-choice { display:flex; justify-content:space-between; align-items:center; padding:13px 15px; background:var(--surface-alt); border-radius:12px; }.article-choice view { display:flex; flex-direction:column; gap:3px; font-size:13px; font-weight:650; }.article-choice small { color:var(--muted); font-size:10px; font-weight:400; }.choice-chevron { color:var(--accent); font-size:20px; transition:transform .25s; }.choice-chevron.open { transform:rotate(180deg); }.article-list { margin-top:8px; max-height:210px; overflow:auto; animation:slide-in .2s ease; }.article-option { display:flex; align-items:center; gap:10px; padding:11px; border-radius:9px; font-size:12px; }.article-option.active { color:var(--accent); background:var(--accent-soft); }.article-option text { color:var(--muted); font-size:10px; }.article-option view { flex:1; }.article-option small { color:var(--muted); font-size:10px; }.source-text { width:100%; height:170px; box-sizing:border-box; padding:13px; margin-top:12px; background:var(--surface-alt); border:1px solid var(--line); border-radius:12px; color:var(--text); font-size:13px; line-height:1.7; }.selection-toolbar { display:flex; justify-content:space-between; gap:10px; align-items:center; margin:12px 0; font-size:10px; color:var(--muted); }.selection-toolbar view { color:var(--accent); background:var(--accent-soft); padding:8px 10px; border-radius:8px; font-size:11px; }.range-row { display:flex; align-items:center; gap:10px; margin:7px 0; }.range-row text { width:26px; color:var(--muted); font-size:11px; }.range-row slider { flex:1; margin:0; }.range-row input { width:54px; height:34px; border-radius:8px; background:var(--surface-alt); text-align:center; font-size:11px; color:var(--text); }.selected-strip { margin-top:14px; border-left:3px solid var(--accent); border-radius:5px; padding:7px 11px; background:var(--accent-soft); }.selected-strip text { color:var(--accent); font-size:10px; }.selected-strip view { max-height:95px; overflow:auto; white-space:pre-wrap; font-size:12px; line-height:1.7; margin-top:5px; }.style-options { display:flex; gap:9px; }.style-options view { flex:1; padding:12px 7px; border:1px solid var(--line); border-radius:11px; background:var(--surface-alt); text-align:center; font-size:12px; }.style-options view.active { color:var(--accent); background:var(--accent-soft); border-color:var(--accent); }.info-option { display:flex; align-items:center; justify-content:space-between; margin-top:19px; font-size:12px; }.info-option text { display:block; color:var(--muted); font-size:10px; margin-top:5px; }.toggle { width:40px; height:24px; padding:3px; box-sizing:border-box; background:var(--line); border-radius:20px; transition:background .2s; }.toggle view { width:18px; height:18px; border-radius:50%; background:white; transition:transform .2s; }.toggle.on { background:var(--accent); }.toggle.on view { transform:translateX(16px); }.actions { display:flex; gap:8px; flex-wrap:wrap; }.actions view { flex:1; min-width:115px; padding:13px 8px; border:1px solid var(--line); background:var(--surface); border-radius:12px; text-align:center; font-size:12px; font-weight:650; }.actions .primary { color:white; background:var(--accent); border-color:var(--accent); }.actions .disabled { opacity:.45; }.actions .busy { opacity:.7; }.error-message { padding:12px; margin-top:12px; border-radius:10px; background:rgba(196,74,74,.1); color:#aa5050; font-size:12px; }.note { color:var(--muted); font-size:11px; margin-top:12px; line-height:1.6; }.preview-label { display:flex; justify-content:space-between; font-size:12px; font-weight:650; margin:4px 0 16px; }.preview-label text { color:var(--muted); font-weight:400; }.preview-paper,.generated-image { display:block; width:100%; box-sizing:border-box; box-shadow:0 20px 60px var(--shadow); border-radius:8px; }.preview-paper { min-height:450px; padding:48px; display:flex; flex-direction:column; }.preview-paper.light { background:#fbfaf7; color:#252a32; }.preview-paper.dark { background:#171b24; color:#f0eee8; }.preview-info { color:#70809a; font-size:12px; margin-bottom:25px; }.preview-copy { flex:1; font-size:20px; line-height:1.85; white-space:pre-wrap; overflow-wrap:anywhere; }.preview-copy>text:not(.highlight) { opacity:.23; }.preview-copy .highlight { background:rgba(92,124,171,.19); border-radius:4px; }.brand { align-self:flex-end; margin-top:38px; font-size:16px; font-weight:700; color:#687e9e; }.brand text { margin-left:6px; font-size:8px; letter-spacing:.1em; }.export-canvas { position:fixed; top:0; left:0; opacity:.001; z-index:-1; pointer-events:none; }@keyframes slide-in { from { opacity:0; transform:translateY(-5px); } }@media(max-width:820px){ .export-grid { grid-template-columns:1fr; }.preview-paper { min-height:310px; padding:30px; }.heading { margin:28px 0; } }
.export-shell { position:relative; z-index:1; }
.export-canvas { z-index:0; }
</style>
