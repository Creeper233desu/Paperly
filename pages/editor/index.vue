<template>
  <view class="editor-screen" :class="[themeClass(), { immersive }]">
    <view class="editor-header"><view class="header-left"><text class="header-back" @tap="leave">‹</text><view class="header-titles"><text>{{ book?.title || '纸间' }}</text><text>{{ chapter?.title || '正文' }}</text></view></view><view class="header-right"><text class="save-label">{{ saveState }}</text><view class="header-tool" :class="{ on: prefs.focus }" @tap="toggleFocus">聚焦</view><view class="header-tool" @tap="showSearch = !showSearch">查找</view><view class="header-tool more" @tap="openSettings">Aa</view></view></view>
    <view v-if="article" class="editor-layout"><view class="outline-rail"><view class="rail-caption">本章目录</view><view v-for="item in chapter?.articles || []" :key="item.id" class="outline-item" :class="{ current: item.id === ids.article }" @tap="item.id !== ids.article && openSibling(item.id)">{{ item.title || '无题正文' }}</view><view class="rail-bottom">{{ chapter?.articles.length || 0 }} 篇正文</view></view>
      <view class="writing-column"><view class="writing-meta"><text>{{ chapter?.title }}</text><text>{{ wordTotal }} 字</text></view><input class="article-name" :value="title" placeholder="篇名（可选）" maxlength="100" @input="onTitle" @blur="saveNow" /><view class="writing-rule"></view><view class="paragraphs" :style="{ fontFamily: fontFamilyFor(prefs.font) }"><textarea v-for="(part, index) in parts" :key="part.id" :id="'p-' + part.id" class="paragraph" :class="{ dimmed: prefs.focus && activeIndex !== index }" :value="part.text" :placeholder="index === 0 ? '从这里开始写…' : ''" :auto-height="true" :maxlength="-1" :focus="focusId === part.id" :selection-start="selectionId === part.id ? selectionStart : -1" :selection-end="selectionId === part.id ? selectionEnd : -1" :style="{ fontFamily: fontFamilyFor(prefs.font), fontSize: prefs.fontSize + 'px' }" @focus="onFocus(index, part.id)" @blur="saveNow" @input="onParagraphInput(index, $event)" /></view><view class="add-paragraph" @tap="appendParagraph">＋ 添加段落</view></view>
      <view class="info-rail"><view class="rail-caption">写作状态</view><view class="info-stat"><text class="info-number">{{ wordTotal }}</text><text>当前字数</text></view><view class="info-stat"><text class="info-number">{{ parts.length }}</text><text>段落</text></view><view class="info-note">让文字留在页面中央。当前段落始终清晰可见。</view></view>
    </view>
    <view class="editor-dock"><view class="dock-group"><view class="dock-icon" @tap="undo">↶</view><view class="dock-icon" @tap="redo">↷</view></view><view class="dock-divider"></view><view class="dock-group symbols"><view class="dock-icon" @tap="insertSymbol('（','）')">（）</view><view class="dock-icon" @tap="insertSymbol('“','”')">“”</view><view class="dock-icon" @tap="insertSymbol('《','》')">《》</view></view><view class="dock-divider"></view><view class="dock-group"><view class="dock-icon" @tap="showSearch = !showSearch">⌕</view><view class="dock-icon" :class="{ active: prefs.focus }" @tap="toggleFocus">◎</view><view class="dock-icon" @tap="mergePrevious">⇤</view><view class="dock-icon" @tap="appendParagraph">＋</view></view><view class="dock-divider"></view><view class="dock-group"><view class="dock-icon" @tap="immersive = !immersive">{{ immersive ? '▣' : '□' }}</view></view></view>
    <view v-if="showSearch" class="search-panel"><view class="search-head"><text>查找与替换</text><text @tap="showSearch = false">完成</text></view><view class="search-inputs"><input v-model="searchQuery" class="search-input" placeholder="查找文字" confirm-type="search" @confirm="nextMatch" /><input v-model="replacement" class="search-input" placeholder="替换为" /></view><view class="search-actions"><text class="match-count">{{ matches.length ? `${Math.max(matchIndex + 1, 0)} / ${matches.length} 处` : '无匹配' }}</text><text @tap="nextMatch">下一个</text><text @tap="replaceCurrent">替换</text><text @tap="replaceEvery">全部替换</text></view></view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { getBook, getArticle, getChapter, saveArticle } from '../../src/store/library'
import { loadPreferences, themeClass, updatePreferences } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import { editParagraph, findMatches, replaceAt, replaceAll } from '../../src/utils/text'

const ids = ref({ book: '', chapter: '', article: '' })
const title = ref(''), parts = ref([]), activeIndex = ref(0), focusId = ref(''), selectionId = ref(''), selectionStart = ref(-1), selectionEnd = ref(-1), lastCursor = ref(0)
const showSearch = ref(false), searchQuery = ref(''), replacement = ref(''), matchIndex = ref(-1), saveState = ref('已保存'), immersive = ref(false)
const prefs = loadPreferences()
let timer = null, historyTimer = null, localId = 0, history = [], historyIndex = -1
const makePart = text => ({ id: `part-${++localId}`, text })
function initialize(options) {
  ids.value = { book: options.bookId, chapter: options.chapterId, article: options.articleId }
  const item = getArticle(options.bookId, options.chapterId, options.articleId)
  if (item) { title.value = item.title; parts.value = (item.paragraphs?.length ? item.paragraphs : ['']).map(makePart); history = [snapshot()]; historyIndex = 0 }
}
onLoad(options => { initialize(options) })
onShow(() => { loadSelectedFont().catch(() => {}) })
onUnload(() => { clearTimeout(historyTimer); saveNow() })
const article = computed(() => getArticle(ids.value.book, ids.value.chapter, ids.value.article))
const chapter = computed(() => getChapter(ids.value.book, ids.value.chapter))
const book = computed(() => getBook(ids.value.book))
const paragraphs = computed(() => parts.value.map(part => part.text))
const wordTotal = computed(() => paragraphs.value.join('').replace(/\s/g, '').length)
const matches = computed(() => findMatches(paragraphs.value, searchQuery.value))
watch(searchQuery, () => { matchIndex.value = -1 })
function snapshot() { return JSON.stringify({ title: title.value, paragraphs: parts.value.map(part => part.text) }) }
function commitHistory() {
  const next = snapshot()
  if (history[historyIndex] === next) return
  history = history.slice(0, historyIndex + 1)
  history.push(next)
  if (history.length > 80) history.shift()
  historyIndex = history.length - 1
}
function scheduleHistory() { clearTimeout(historyTimer); historyTimer = setTimeout(commitHistory, 600) }
function restoreHistory(index) {
  const data = JSON.parse(history[index])
  title.value = data.title; parts.value = data.paragraphs.map(makePart)
  activeIndex.value = Math.min(activeIndex.value, parts.value.length - 1)
  focusAt(activeIndex.value, parts.value[activeIndex.value]?.text.length || 0)
  scheduleSave()
}
function undo() { clearTimeout(historyTimer); commitHistory(); if (historyIndex > 0) { historyIndex -= 1; restoreHistory(historyIndex) } }
function redo() { clearTimeout(historyTimer); if (historyIndex < history.length - 1) { historyIndex += 1; restoreHistory(historyIndex) } }
function scheduleSave() { saveState.value = '保存中…'; clearTimeout(timer); timer = setTimeout(saveNow, 350) }
function saveNow() { clearTimeout(timer); if (!ids.value.article) return; try { saveArticle(ids.value.book, ids.value.chapter, ids.value.article, { title: title.value, paragraphs: paragraphs.value }); saveState.value = '已保存' } catch (_) { saveState.value = '保存失败'; uni.showToast({ title: '保存失败，请检查存储空间', icon: 'none' }) } }
function onTitle(e) { title.value = e.detail.value; scheduleHistory(); scheduleSave() }
function onFocus(index, id) { activeIndex.value = index; focusId.value = id; lastCursor.value = parts.value[index]?.text.length || 0 }
function focusAt(index, cursor, end = cursor) { nextTick(() => { const part = parts.value[index]; if (!part) return; focusId.value = ''; selectionId.value = ''; nextTick(() => { activeIndex.value = index; selectionId.value = part.id; selectionStart.value = cursor; selectionEnd.value = end; lastCursor.value = cursor; focusId.value = part.id; uni.pageScrollTo({ selector: '#p-' + part.id, duration: 180 }) }) }) }
function onParagraphInput(index, e) {
  const current = parts.value[index]; if (!current) return
  const value = e.detail.value ?? ''
  const result = editParagraph(current.text, value, e.detail.cursor, prefs.autoPair)
  if (result.split) { const replacements = result.paragraphs.map(makePart); parts.value.splice(index, 1, ...replacements); const target = index + replacements.length - 1; focusAt(target, Math.min(result.cursor, replacements[replacements.length - 1].text.length)) }
  else { current.text = result.paragraphs[0]; lastCursor.value = result.cursor; if (current.text !== value) focusAt(index, result.cursor) }
  scheduleHistory(); scheduleSave()
}
function insertSymbol(open, close) {
  const index = activeIndex.value
  const part = parts.value[index]; if (!part) return
  const cursor = Math.min(lastCursor.value, part.text.length)
  part.text = part.text.slice(0, cursor) + open + close + part.text.slice(cursor)
  focusAt(index, cursor + open.length); scheduleHistory(); scheduleSave()
}
function appendParagraph() { parts.value.push(makePart('')); focusAt(parts.value.length - 1, 0); scheduleHistory(); scheduleSave() }
function mergePrevious() { const index = activeIndex.value; if (index <= 0) return; const length = parts.value[index - 1].text.length; parts.value[index - 1].text += parts.value[index].text; parts.value.splice(index, 1); focusAt(index - 1, length); scheduleHistory(); scheduleSave() }
function leave() { clearTimeout(historyTimer); saveNow(); uni.navigateBack() }
function openSibling(articleId) { saveNow(); uni.redirectTo({ url: `/pages/editor/index?bookId=${ids.value.book}&chapterId=${ids.value.chapter}&articleId=${articleId}` }) }
function openSettings() { saveNow(); uni.navigateTo({ url: '/pages/settings/index' }) }
function toggleFocus() { updatePreferences({ focus: !prefs.focus }) }
function nextMatch() { if (!matches.value.length) return; matchIndex.value = (matchIndex.value + 1) % matches.value.length; const match = matches.value[matchIndex.value]; focusAt(match.paragraphIndex, match.start, match.end) }
function replaceCurrent() { if (!matches.value.length) return; if (matchIndex.value < 0) matchIndex.value = 0; const match = matches.value[matchIndex.value]; const updated = replaceAt(paragraphs.value, match, replacement.value); parts.value[match.paragraphIndex].text = updated[match.paragraphIndex]; focusAt(match.paragraphIndex, match.start + replacement.value.length); matchIndex.value = -1; scheduleHistory(); scheduleSave() }
function replaceEvery() { if (!searchQuery.value) return; const result = replaceAll(paragraphs.value, searchQuery.value, replacement.value); result.paragraphs.forEach((text, index) => { parts.value[index].text = text }); scheduleHistory(); scheduleSave(); uni.showToast({ title: `已替换 ${result.count} 处`, icon: 'none' }) }
</script>

<style scoped>
.editor-screen { --writer-bg: var(--bg); --writer-text: var(--text); min-height: 100vh; background: var(--writer-bg); color: var(--writer-text); padding: var(--status-bar-height) 24px 120px; transition: background .25s ease; }.editor-screen.theme-dark { --writer-bg: #0d0f13; --writer-text: #f0f0ee; }
.editor-header { width: 100%; max-width: 1440px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }.header-left, .header-right { display: flex; align-items: center; gap: 13px; }.header-back { font-size: 32px; padding: 0 10px 5px 0; line-height: 1; }.header-titles { display: flex; flex-direction: column; gap: 3px; font-size: 13px; font-weight: 650; }.header-titles text:last-child { color: var(--muted); font-size: 11px; font-weight: 400; }.header-right { font-size: 12px; }.save-label { color: var(--muted); margin-right: 8px; }.header-tool { padding: 9px 12px; border: 1px solid var(--line); border-radius: 11px; color: var(--muted); }.header-tool.on { color: var(--accent); background: var(--accent-soft); }.header-tool.more { font-size: 14px; font-weight: 700; }
.editor-layout { width: 100%; max-width: 1440px; margin: 20px auto 0; display: grid; grid-template-columns: minmax(170px, 210px) minmax(0, 760px) minmax(130px, 190px); gap: clamp(20px, 4vw, 66px); justify-content: center; }.outline-rail, .info-rail { position: sticky; top: 90px; height: fit-content; padding-top: 70px; }.rail-caption { color: var(--muted); font-size: 11px; letter-spacing: .1em; margin-bottom: 20px; }.outline-item { color: var(--muted); font-size: 12px; padding: 11px 14px; border-radius: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px; }.outline-item.current { color: var(--accent); background: var(--accent-soft); font-weight: 650; }.rail-bottom { color: var(--muted); font-size: 11px; margin: 25px 14px; }.info-stat { margin-bottom: 25px; display: flex; flex-direction: column; gap: 4px; }.info-stat .info-number { font-size: 25px; font-weight: 600; color: var(--text); }.info-stat text { font-size: 11px; color: var(--muted); }.info-note { color: var(--muted); font-size: 11px; line-height: 1.8; padding-top: 15px; border-top: 1px solid var(--line); }
.writing-column { min-width: 0; padding: 20px 0 80px; }.writing-meta { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 12px; letter-spacing: .07em; margin-bottom: 36px; }.article-name { width: 100%; height: 56px; text-align: center; color: var(--muted); font-size: clamp(22px, 2.4vw, 31px); font-weight: 600; margin-bottom: 22px; }.writing-rule { width: 34px; height: 1px; background: var(--line); margin: 0 auto 58px; }.paragraphs { min-height: 40vh; }.paragraph { display: block; width: 100%; min-height: 62px; padding: 0 2px; border: 0; background: transparent; color: var(--writer-text); line-height: 2.05; letter-spacing: .035em; margin-bottom: 19px; text-indent: 2em; transition: opacity .23s ease; }.paragraph.dimmed { opacity: .22; }.add-paragraph { color: var(--muted); font-size: 12px; padding: 14px 0; }
.editor-dock { position: fixed; z-index: 12; left: 50%; bottom: calc(15px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; align-items: center; justify-content: center; gap: 11px; background: var(--surface); border: 1px solid var(--line); border-radius: 21px; min-height: 59px; padding: 7px 11px; box-shadow: 0 20px 55px var(--shadow); transition: opacity .2s ease, transform .2s ease; }.dock-group { display: flex; align-items: center; gap: 2px; }.dock-icon { min-width: 39px; height: 41px; padding: 0 5px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 20px; transition: background .18s ease, color .18s ease, transform .18s ease; }.dock-icon:active { background: var(--surface-alt); transform: scale(.9); }.dock-icon.active { color: var(--accent); background: var(--accent-soft); }.dock-divider { width: 1px; height: 23px; background: var(--line); }
.search-panel { position: fixed; z-index: 14; right: max(24px, calc((100vw - 1200px)/2)); bottom: calc(88px + env(safe-area-inset-bottom)); width: min(480px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 22px; box-shadow: 0 24px 65px var(--shadow); animation: panel-in .2s ease both; }.search-head { display: flex; justify-content: space-between; font-size: 15px; font-weight: 650; margin-bottom: 16px; }.search-head text:last-child { color: var(--accent); font-size: 12px; font-weight: 500; }.search-inputs { display: flex; gap: 8px; }.search-input { flex: 1; width: 0; height: 40px; border-radius: 10px; background: var(--surface-alt); color: var(--text); font-size: 12px; padding: 0 11px; }.search-actions { display: flex; justify-content: flex-end; align-items: center; gap: 18px; color: var(--accent); font-size: 12px; padding-top: 16px; }.match-count { margin-right: auto; color: var(--muted); }
.immersive .outline-rail, .immersive .info-rail, .immersive .writing-meta, .immersive .writing-rule { opacity: 0; pointer-events: none; }.immersive .editor-header { opacity: .2; transition: opacity .2s; }.immersive .editor-header:active { opacity: 1; }.immersive .editor-layout { grid-template-columns: minmax(0, 760px); }.immersive .outline-rail, .immersive .info-rail { display: none; }.immersive .writing-column { padding-top: 45px; }
@keyframes panel-in { from { opacity: 0; transform: translateY(12px); } }
@media (max-width: 1100px) and (min-width: 761px) { .editor-layout { grid-template-columns: 105px minmax(0, 560px) 85px; gap: 24px; }.outline-rail, .info-rail { padding-top: 70px; } }
@media (max-width: 760px) { .editor-layout { grid-template-columns: minmax(0, 680px); }.outline-rail, .info-rail { display: none; } }
@media (max-width: 600px) { .editor-screen { padding-left: 21px; padding-right: 21px; }.editor-header { height: 58px; }.save-label { display: none; }.header-right { gap: 5px; }.header-tool { padding: 7px 8px; font-size: 11px; }.editor-layout { margin-top: 0; }.writing-column { padding-top: 8px; }.writing-meta { margin-bottom: 25px; }.writing-rule { margin-bottom: 38px; }.paragraph { line-height: 1.95; margin-bottom: 15px; }.editor-dock { width: calc(100vw - 18px); gap: 4px; padding: 5px; border-radius: 16px; }.dock-group { flex: 1; justify-content: space-evenly; }.dock-icon { min-width: 30px; font-size: 17px; }.symbols .dock-icon { font-size: 14px; }.search-inputs { flex-direction: column; }.search-input { width: 100%; flex: none; } }
@media (prefers-reduced-motion: reduce) { .editor-screen, .editor-dock, .paragraph, .dock-icon, .search-panel { transition: none; animation: none; } }
</style>
