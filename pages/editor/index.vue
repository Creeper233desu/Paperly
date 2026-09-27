<template>
  <view class="editor-screen" :class="[themeClass(), { immersive, 'ai-open': showAi }]">
    <view class="editor-header"><view class="header-left"><text class="header-back" @tap="leave">‹</text><view class="outline-trigger" @tap="showOutline = !showOutline">☰</view><view class="header-titles"><text>{{ book?.title || '纸间' }}</text><text>{{ chapter?.title || '正文' }}</text></view></view><view class="header-right"><text class="save-label">{{ saveState }}</text><view class="header-tool more" @tap="openSettings">Aa</view></view></view>
    <view v-if="showOutline" class="outline-backdrop" @tap="showOutline = false"></view>
    <view v-if="article" class="editor-layout" :class="{ switching }"><view class="outline-rail" :class="{ open: showOutline }"><view class="rail-top"><view class="rail-caption">篇章目录</view><text @tap="showOutline = false">×</text></view><view class="outline-scroll"><view v-for="(group, groupIndex) in book?.chapters || []" :key="group.id" class="outline-group"><view class="outline-chapter" :class="{ current: group.id === ids.chapter }" @tap="toggleChapter(group.id)"><text class="outline-caret">{{ collapsedChapters[group.id] ? '›' : '⌄' }}</text><text>{{ groupIndex + 1 }}. {{ group.title }}</text><text class="outline-count">{{ group.articles.length }}</text></view><view v-if="!collapsedChapters[group.id]" class="outline-articles"><view v-for="item in group.articles" :key="item.id" class="outline-item" :class="{ current: item.id === ids.article }" @tap="item.id !== ids.article ? openSibling(group.id, item.id) : showOutline = false">{{ item.title || '无题正文' }}</view></view></view></view><view class="rail-bottom">{{ book?.chapters.length || 0 }} 章 · {{ bookArticleCount }} 篇</view></view>
      <view class="writing-column"><view class="writing-meta"><text>{{ chapter?.title }}</text><text>{{ wordTotal }} 字 · {{ paragraphCount }} 段</text></view><input class="article-name" :value="title" placeholder="" maxlength="100" @input="onTitle" @blur="saveNow" /><view class="writing-rule"></view><view class="document-wrap"><DocumentInput :value="body" :document-id="ids.article" :document-revision="documentRevision" :font-family="fontFamilyFor(prefs.font)" :font-size="prefs.fontSize" :focus-mode="prefs.focus" :animated-cursor="prefs.animatedCursor" :cursor-style="prefs.cursorStyle" :cursor-trail-color="prefs.cursorTrailColor" :cursor-trail-length="prefs.cursorTrailLength" :cursor-request="cursorRequest" @blur="saveNow" @input="onDocumentInput" @cursor="onVisualCursor" @ask-ai="onAskAi" /></view></view>
      <view class="info-rail"><view class="status-summary"><view class="rail-caption">写作状态</view><view class="info-stat"><text class="info-number">{{ wordTotal }}</text><text>当前字数</text></view><view class="info-stat"><text class="info-number">{{ paragraphCount }}</text><text>段落</text></view><view class="info-note">文字会自动保存。目录中可随时切换篇章。</view></view><view class="assistant-slot" :class="{ open: showAi }"><AiAssistant v-if="book" ref="aiRef" :book="book" :article-id="ids.article" :body="body" :selected-text="selectedContext" :api-key="prefs.aiApiKey" :model="prefs.aiModel" :system-prompt="prefs.aiSystemPrompt" @close="showAi = false" @clear-selection="selectedContext = ''" @apply="applyAiProposal" /></view></view>
    </view>
    <view class="editor-dock"><view class="dock-count">{{ wordTotal }} 字</view><view class="dock-divider"></view><view class="dock-group"><view class="dock-icon" @tap="undo">↶</view><view class="dock-icon" @tap="redo">↷</view></view><view class="dock-divider"></view><view class="dock-group symbols"><view class="dock-icon" @tap="insertSymbol('（','）')">（）</view><view class="dock-icon" @tap="insertSymbol('“','”')">“”</view><view class="dock-icon" @tap="insertSymbol('「','」')">「」</view></view><view class="dock-divider"></view><view class="dock-group"><view class="dock-icon" @tap="showSearch = !showSearch">⌕</view><view class="dock-icon" :class="{ active: prefs.focus }" @tap="toggleFocus">◎</view><view class="dock-icon" @tap="appendParagraph">↵</view><view class="dock-icon ai-dock" :class="{ active: showAi }" @tap="toggleAi">✦</view></view><view class="dock-divider"></view><view class="dock-group"><view class="dock-icon" @tap="immersive = !immersive">{{ immersive ? '▣' : '□' }}</view></view></view>
    <view v-if="showSearch" class="search-panel"><view class="search-head"><text>查找与替换</text><text @tap="showSearch = false">完成</text></view><view class="search-inputs"><input v-model="searchQuery" class="search-input" placeholder="查找文字" confirm-type="search" @confirm="nextMatch" /><input v-model="replacement" class="search-input" placeholder="替换为" /></view><view class="search-actions"><text class="match-count">{{ matches.length ? `${Math.max(matchIndex + 1, 0)} / ${matches.length} 处` : '无匹配' }}</text><text @tap="previousMatch">上一个</text><text @tap="nextMatch">下一个</text><text @tap="replaceCurrent">替换</text><text @tap="replaceEvery">全部替换</text></view></view>
  </view>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onReady, onShow, onUnload } from '@dcloudio/uni-app'
import { getBook, getArticle, getChapter, saveArticle } from '../../src/store/library'
import { loadPreferences, themeClass, updatePreferences } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import DocumentInput from '../../components/DocumentInput.vue'
import AiAssistant from '../../components/AiAssistant.vue'
import { documentFromParagraphs, editDocument, findMatches, paragraphOffset, paragraphsFromDocument, replaceAt, replaceAll, stepMatchIndex, stripLegacyIndents } from '../../src/utils/text'

const ids = ref({ book: '', chapter: '', article: '' })
const documentRevision = ref(0)
const title = ref(''), body = ref(''), cursorRequest = ref({ seq: 0, start: 0, end: 0 }), lastCursor = ref(0)
const showSearch = ref(false), showOutline = ref(false), searchQuery = ref(''), replacement = ref(''), matchIndex = ref(-1), saveState = ref('已保存'), immersive = ref(false), switching = ref(false)
const showAi = ref(false), selectedContext = ref(''), aiRef = ref(null)
const collapsedChapters = reactive({})
const prefs = loadPreferences()
let timer = null, historyTimer = null, switchTimer = null, history = [], historyIndex = -1
let resumeCursor = null
function initialize(options) {
  ids.value = { book: options.bookId, chapter: options.chapterId, article: options.articleId }
  const item = getArticle(options.bookId, options.chapterId, options.articleId)
  if (item) {
    title.value = item.title
    const originalCursor = options.cursor == null ? null : Math.max(0, Number(options.cursor) || 0)
    const normalized = stripLegacyIndents(item.paragraphs, originalCursor)
    body.value = documentFromParagraphs(normalized.paragraphs)
    resumeCursor = normalized.cursor
    lastCursor.value = resumeCursor ?? 0
    history = [snapshot()]
    historyIndex = 0
  }
}
onLoad(options => { initialize(options) })
onReady(() => { if (resumeCursor !== null) focusAt(Math.min(resumeCursor, body.value.length)) })
onShow(() => { loadSelectedFont().catch(() => {}) })
onUnload(() => { clearTimeout(historyTimer); clearTimeout(timer); clearTimeout(switchTimer); saveNow() })
const article = computed(() => getArticle(ids.value.book, ids.value.chapter, ids.value.article))
const chapter = computed(() => getChapter(ids.value.book, ids.value.chapter))
const book = computed(() => getBook(ids.value.book))
const paragraphs = computed(() => paragraphsFromDocument(body.value))
const paragraphCount = computed(() => paragraphs.value.length)
const wordTotal = computed(() => body.value.replace(/\s/g, '').length)
const bookArticleCount = computed(() => book.value?.chapters.reduce((sum, group) => sum + group.articles.length, 0) || 0)
const matches = computed(() => findMatches(paragraphs.value, searchQuery.value))
watch(searchQuery, () => { matchIndex.value = -1 })
function snapshot() { return JSON.stringify({ title: title.value, body: body.value }) }
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
  title.value = data.title; body.value = data.body
  focusAt(Math.min(lastCursor.value, body.value.length), undefined, { preserveScroll: true })
  scheduleSave()
}
function undo() { clearTimeout(historyTimer); commitHistory(); if (historyIndex > 0) { historyIndex -= 1; restoreHistory(historyIndex) } }
function redo() { clearTimeout(historyTimer); if (historyIndex < history.length - 1) { historyIndex += 1; restoreHistory(historyIndex) } }
function scheduleSave() { saveState.value = '保存中…'; clearTimeout(timer); timer = setTimeout(saveNow, 350) }
function saveNow() { clearTimeout(timer); if (!ids.value.article) return; try { saveArticle(ids.value.book, ids.value.chapter, ids.value.article, { title: title.value, paragraphs: paragraphs.value, cursor: lastCursor.value }); saveState.value = '已保存' } catch (_) { saveState.value = '保存失败'; uni.showToast({ title: '保存失败，请检查存储空间', icon: 'none' }) } }
function onTitle(e) { title.value = e.detail.value; scheduleHistory(); scheduleSave() }
function onVisualCursor(cursor) {
  if (cursor && typeof cursor === 'object') { if (cursor.documentId && cursor.documentId !== ids.value.article) return; cursor = cursor.offset }
  if (Number.isFinite(cursor) && cursor >= 0) lastCursor.value = cursor
}
function focusAt(cursor, end = cursor, options = {}) {
  const at = Math.max(0, Math.min(cursor, body.value.length))
  lastCursor.value = at
  cursorRequest.value = { seq: cursorRequest.value.seq + 1, start: at, end: Math.max(at, Math.min(end ?? at, body.value.length)), value: body.value, documentId: ids.value.article, animate: !!options.animate, preserveScroll: options.preserveScroll !== false, reveal: !!options.reveal, focus: options.focus !== false }
}
function onDocumentInput(e) {
  if (e.detail?.documentId && e.detail.documentId !== ids.value.article) return
  const value = e.detail.value ?? ''
  const result = editDocument(body.value, value, e.detail.cursor, e.detail.source === 'menu' ? false : prefs.autoPair)
  body.value = result.text
  lastCursor.value = result.cursor
  if (result.text !== value) focusAt(result.cursor)
  scheduleHistory(); scheduleSave()
}
function insertSymbol(open, close) {
  const cursor = Math.min(lastCursor.value, body.value.length)
  body.value = body.value.slice(0, cursor) + open + close + body.value.slice(cursor)
  focusAt(cursor + open.length); scheduleHistory(); scheduleSave()
}
function appendParagraph() {
  const cursor = Math.min(lastCursor.value, body.value.length)
  body.value = body.value.slice(0, cursor) + '\n' + body.value.slice(cursor)
  focusAt(cursor + 1, undefined, { animate: true }); scheduleHistory(); scheduleSave()
}
function leave() { clearTimeout(historyTimer); saveNow(); uni.navigateBack() }
function toggleChapter(id) { collapsedChapters[id] = !collapsedChapters[id] }
function openSibling(chapterId, articleId) {
  const item = getArticle(ids.value.book, chapterId, articleId)
  if (!item) return
  saveNow(); clearTimeout(historyTimer); clearTimeout(switchTimer)
  const normalized = stripLegacyIndents(item.paragraphs)
  ids.value = { book: ids.value.book, chapter: chapterId, article: articleId }
  documentRevision.value += 1
  title.value = item.title
  body.value = documentFromParagraphs(normalized.paragraphs)
  lastCursor.value = 0
  history = [snapshot()]; historyIndex = 0
  matchIndex.value = -1; showSearch.value = false; showOutline.value = false
  switching.value = true
  focusAt(0, 0, { focus: false, preserveScroll: false, reveal: true })
  switchTimer = setTimeout(() => { switching.value = false }, 220)
}
function openSettings() { saveNow(); uni.navigateTo({ url: '/pages/settings/index' }) }
function toggleFocus() { updatePreferences({ focus: !prefs.focus }) }
function toggleAi() { if (immersive.value) immersive.value = false; showAi.value = !showAi.value }
function onAskAi(selection) { selectedContext.value = selection?.text || ''; immersive.value = false; showAi.value = true }
function applyAiProposal(index) {
  const proposal = aiRef.value?.getProposal(index)
  if (!proposal || proposal.error) return
  const target = getArticle(ids.value.book, proposal.chapterId, proposal.articleId)
  const latest = proposal.articleId === ids.value.article ? body.value : documentFromParagraphs(target?.paragraphs)
  if (!target || latest !== proposal.before) return uni.showToast({ title: '正文已变化，请重新让助手生成修改', icon: 'none' })
  if (proposal.articleId === ids.value.article) {
    commitHistory()
    body.value = proposal.after
    focusAt(proposal.cursor, undefined, { preserveScroll: true })
    commitHistory(); saveNow()
  } else saveArticle(ids.value.book, proposal.chapterId, proposal.articleId, { paragraphs: proposal.paragraphs, cursor: proposal.cursor })
  aiRef.value.removeProposal(index)
  uni.showToast({ title: '已应用修改', icon: 'none' })
}
function showMatch(index) { if (!matches.value.length) return; matchIndex.value = (index + matches.value.length) % matches.value.length; const match = matches.value[matchIndex.value]; focusAt(paragraphOffset(paragraphs.value, match.paragraphIndex, match.end), undefined, { animate: true, reveal: true, preserveScroll: false }) }
function nextMatch() { showMatch(stepMatchIndex(matchIndex.value, matches.value.length, 1)) }
function previousMatch() { showMatch(stepMatchIndex(matchIndex.value, matches.value.length, -1)) }
function replaceCurrent() { if (!matches.value.length) return; if (matchIndex.value < 0) matchIndex.value = 0; const match = matches.value[matchIndex.value]; const updated = replaceAt(paragraphs.value, match, replacement.value); body.value = documentFromParagraphs(updated); focusAt(paragraphOffset(updated, match.paragraphIndex, match.start + replacement.value.length)); matchIndex.value = -1; scheduleHistory(); scheduleSave() }
function replaceEvery() { if (!searchQuery.value) return; const result = replaceAll(paragraphs.value, searchQuery.value, replacement.value); body.value = documentFromParagraphs(result.paragraphs); scheduleHistory(); scheduleSave(); uni.showToast({ title: `已替换 ${result.count} 处`, icon: 'none' }) }
</script>

<style scoped>
.editor-screen { --writer-bg: var(--bg); --writer-text: var(--text); min-height: 100vh; background: var(--writer-bg); color: var(--writer-text); padding: var(--status-bar-height) 24px 120px; transition: background .25s ease; }.editor-screen.theme-dark { --writer-bg: #0d0f13; --writer-text: #f0f0ee; }
.editor-header { width: 100%; max-width: 1440px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }.header-left, .header-right { display: flex; align-items: center; gap: 13px; }.header-back { font-size: 32px; padding: 0 10px 5px 0; line-height: 1; }.header-titles { display: flex; flex-direction: column; gap: 3px; font-size: 13px; font-weight: 650; }.header-titles text:last-child { color: var(--muted); font-size: 11px; font-weight: 400; }.header-right { font-size: 12px; }.save-label { color: var(--muted); margin-right: 8px; }.header-tool { padding: 9px 12px; border: 1px solid var(--line); border-radius: 11px; color: var(--muted); }.header-tool.on { color: var(--accent); background: var(--accent-soft); }.header-tool.more { font-size: 14px; font-weight: 700; }
.editor-layout { width: 100%; max-width: 1440px; margin: 20px auto 0; display: grid; grid-template-columns: minmax(0px, 210px) minmax(0px, 760px) minmax(0px, 190px); gap: clamp(20px, 4vw, 66px); justify-content: center; transition: grid-template-columns .38s cubic-bezier(.22,.8,.22,1), gap .38s cubic-bezier(.22,.8,.22,1); }.outline-rail, .info-rail { position: sticky; top: 90px; height: fit-content; padding-top: 70px; min-width: 0; transition: opacity .3s ease, transform .38s cubic-bezier(.22,.8,.22,1); }.rail-caption { color: var(--muted); font-size: 11px; letter-spacing: .1em; margin-bottom: 20px; }.outline-item { color: var(--muted); font-size: 12px; padding: 11px 14px; border-radius: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px; }.outline-item.current { color: var(--accent); background: var(--accent-soft); font-weight: 650; }.rail-bottom { color: var(--muted); font-size: 11px; margin: 25px 14px; }.info-stat { margin-bottom: 25px; display: flex; flex-direction: column; gap: 4px; }.info-stat .info-number { font-size: 25px; font-weight: 600; color: var(--text); }.info-stat text { font-size: 11px; color: var(--muted); }.info-note { color: var(--muted); font-size: 11px; line-height: 1.8; padding-top: 15px; border-top: 1px solid var(--line); }
.ai-open .editor-layout { grid-template-columns:minmax(0,175px) minmax(0,690px) minmax(300px,350px); gap:clamp(16px,2.2vw,34px); }.ai-open .info-rail { padding-top:0; }.status-summary { transition:all .3s ease; }.ai-open .status-summary { display:flex; align-items:center; gap:14px; min-height:58px; padding:0 8px; }.ai-open .status-summary .rail-caption { margin:0 auto 0 0; }.ai-open .status-summary .info-stat { display:flex; flex-direction:row; align-items:baseline; gap:4px; margin:0; white-space:nowrap; }.ai-open .status-summary .info-number { font-size:17px; }.ai-open .status-summary .info-note { display:none; }.assistant-slot { max-height:0; opacity:0; transform:translateX(34px); overflow:hidden; transition:max-height .38s ease,opacity .32s ease,transform .38s cubic-bezier(.22,.8,.22,1); }.assistant-slot.open { max-height:700px; opacity:1; transform:translateX(0); overflow:visible; }.ai-dock { font-size:20px; }
@media (max-width:1100px) and (min-width:761px) { .ai-open .editor-layout { grid-template-columns:minmax(0,110px) minmax(0,1fr) minmax(280px,320px); gap:14px; }.ai-open .status-summary { gap:8px; } }
.ai-open .status-summary .rail-caption { display:none; }
@media (max-width:760px) { .ai-open .editor-layout { grid-template-columns:minmax(0,680px); }.ai-open .info-rail { display:block; position:fixed; z-index:23; right:0; top:var(--status-bar-height); bottom:76px; width:min(370px,94vw); height:auto; padding:12px; border-radius:20px 0 0 20px; background:var(--surface); box-shadow:-20px 0 65px var(--shadow); animation:assistant-enter .32s cubic-bezier(.22,.8,.22,1); }.ai-open .assistant-slot.open { max-height:calc(100vh - 165px); }.ai-open .assistant-panel { height:calc(100vh - 180px); }.ai-open .status-summary { justify-content:flex-start; }.ai-open .status-summary .rail-caption { margin-right:0; }@keyframes assistant-enter { from { transform:translateX(100%); opacity:.5; } } }
.writing-column { min-width: 0; padding: 20px 0 80px; }.writing-meta { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 12px; letter-spacing: .07em; margin-bottom: 36px; }.article-name { width: 100%; height: 56px; text-align: center; color: var(--muted); font-size: clamp(22px, 2.4vw, 31px); font-weight: 600; margin-bottom: 22px; }.writing-rule { width: 34px; height: 1px; background: var(--line); margin: 0 auto 58px; }
.editor-dock { position: fixed; z-index: 12; left: 50%; bottom: calc(15px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; align-items: center; justify-content: center; gap: 11px; background: var(--surface); border: 1px solid var(--line); border-radius: 21px; min-height: 59px; padding: 7px 11px; box-shadow: 0 20px 55px var(--shadow); transition: opacity .2s ease, transform .2s ease; }.dock-group { display: flex; align-items: center; gap: 2px; }.dock-icon { min-width: 39px; height: 41px; padding: 0 5px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 20px; transition: background .18s ease, color .18s ease, transform .18s ease; }.dock-icon:active { background: var(--surface-alt); transform: scale(.9); }.dock-icon.active { color: var(--accent); background: var(--accent-soft); }.dock-divider { width: 1px; height: 23px; background: var(--line); }
.search-panel { position: fixed; z-index: 14; right: max(24px, calc((100vw - 1200px)/2)); bottom: calc(88px + env(safe-area-inset-bottom)); width: min(480px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 22px; box-shadow: 0 24px 65px var(--shadow); animation: panel-in .2s ease both; }.search-head { display: flex; justify-content: space-between; font-size: 15px; font-weight: 650; margin-bottom: 16px; }.search-head text:last-child { color: var(--accent); font-size: 12px; font-weight: 500; }.search-inputs { display: flex; gap: 8px; }.search-input { flex: 1; width: 0; height: 40px; border-radius: 10px; background: var(--surface-alt); color: var(--text); font-size: 12px; padding: 0 11px; }.search-actions { display: flex; justify-content: flex-end; align-items: center; gap: 18px; color: var(--accent); font-size: 12px; padding-top: 16px; }.match-count { margin-right: auto; color: var(--muted); }
.immersive .outline-rail, .immersive .info-rail { opacity: 0; pointer-events: none; overflow: hidden; }.immersive .outline-rail { transform: translateX(-48px); }.immersive .info-rail { transform: translateX(48px); }.immersive .writing-meta, .immersive .writing-rule { opacity: 0; pointer-events: none; }.immersive .editor-header { opacity: .2; transition: opacity .2s; }.immersive .editor-header:active { opacity: 1; }.immersive .editor-layout { grid-template-columns: minmax(0px, 0px) minmax(0px, 760px) minmax(0px, 0px); gap: 0; }
@keyframes panel-in { from { opacity: 0; transform: translateY(12px); } }
@media (max-width: 1100px) and (min-width: 761px) { .editor-layout { grid-template-columns: minmax(0px, 105px) minmax(0px, 560px) minmax(0px, 85px); gap: 24px; }.immersive .editor-layout { grid-template-columns: minmax(0px, 0px) minmax(0px, 560px) minmax(0px, 0px); gap: 0; }.outline-rail, .info-rail { padding-top: 70px; } }
@media (max-width: 760px) { .editor-layout { grid-template-columns: minmax(0, 680px); }.outline-rail, .info-rail { display: none; } }
@media (max-width: 600px) { .editor-screen { padding-left: 21px; padding-right: 21px; }.editor-header { height: 58px; }.save-label { display: none; }.header-right { gap: 5px; }.header-tool { padding: 7px 8px; font-size: 11px; }.editor-layout { margin-top: 0; }.writing-column { padding-top: 8px; }.writing-meta { margin-bottom: 25px; }.writing-rule { margin-bottom: 38px; }.editor-dock { width: calc(100vw - 18px); gap: 4px; padding: 5px; border-radius: 16px; }.dock-group { flex: 1; justify-content: space-evenly; }.dock-icon { min-width: 30px; font-size: 17px; }.symbols .dock-icon { font-size: 14px; }.search-inputs { flex-direction: column; }.search-input { width: 100%; flex: none; } }
@media (prefers-reduced-motion: reduce) { .editor-screen, .editor-dock, .dock-icon, .search-panel { transition: none; animation: none; } }
.outline-trigger { display: none; color: var(--muted); font-size: 19px; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 10px; }
.outline-trigger:active { background: var(--surface-alt); }
.outline-backdrop { display: none; }
.rail-top { display: flex; justify-content: space-between; align-items: center; }
.rail-top > text { display: none; font-size: 23px; color: var(--muted); }
.outline-scroll { max-height: calc(100vh - 260px); overflow-y: auto; }
.outline-group { margin: 0 0 13px; }
.outline-chapter { display: flex; align-items: center; gap: 7px; min-height: 38px; padding: 6px 7px; color: var(--muted); font-size: 12px; font-weight: 650; border-radius: 9px; }
.outline-chapter.current { color: var(--text); }
.outline-caret { font-size: 18px; width: 13px; flex-shrink: 0; }
.outline-chapter > text:nth-child(2) { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; }
.outline-count { color: var(--muted); font-size: 10px; }
.outline-articles { border-left: 1px solid var(--line); margin: 0 0 0 17px; padding: 1px 0 1px 9px; }
.outline-item { position: relative; margin: 0 0 2px; padding: 8px 9px; }
.outline-item.current::before { content: ''; position: absolute; left: -10px; top: 7px; bottom: 7px; width: 2px; border-radius: 3px; background: var(--accent); }
.writing-meta { margin-bottom: 18px; }
.article-name { height: 49px; margin-bottom: 10px; }
.writing-rule { margin-bottom: 27px; }
.document-wrap { position: relative; min-height: 38vh; line-height: 1.85; letter-spacing: .025em; }
.editor-layout.switching .writing-column { animation: article-switch-in .22s ease both; }.editor-layout.switching .info-number { animation: count-switch-in .22s ease both; }
@keyframes article-switch-in { from { opacity:.72; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
@keyframes count-switch-in { from { opacity:.42; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
.search-actions { flex-wrap:wrap; gap:11px 16px; }
.dock-count { min-width: 48px; color: var(--muted); font-size: 11px; text-align: center; white-space: nowrap; }
.immersive .writing-meta { opacity: .55; pointer-events: auto; }
@media (max-width: 760px) { .outline-trigger { display: flex; }.outline-backdrop { display: block; position: fixed; z-index: 24; inset: 0; background: rgba(6, 9, 16, .45); }.outline-rail { display: none; position: fixed; z-index: 25; left: 0; top: 0; bottom: 0; width: min(330px, 86vw); height: auto; padding: calc(var(--status-bar-height) + 27px) 18px 28px; background: var(--surface); box-shadow: 20px 0 55px rgba(0,0,0,.22); animation: outline-in .24s cubic-bezier(.2,.75,.25,1) both; }.outline-rail.open { display: block; }.rail-top > text { display: block; }.outline-scroll { max-height: calc(100vh - 185px); }.outline-chapter { font-size: 14px; }.outline-item { font-size: 13px; padding: 11px 12px; } }
@media (max-width:760px) { .info-rail { display:block; position:fixed; z-index:23; right:0; top:var(--status-bar-height); bottom:76px; width:min(370px,94vw); height:auto; padding:12px; border-radius:20px 0 0 20px; background:var(--surface); box-shadow:-20px 0 65px var(--shadow); transform:translateX(105%); opacity:0; pointer-events:none; transition:transform .36s cubic-bezier(.22,.8,.22,1),opacity .3s ease; }.ai-open .info-rail { transform:translateX(0); opacity:1; pointer-events:auto; animation:none; } }
@media (max-width: 600px) { .writing-meta { margin-bottom: 16px; }.writing-rule { margin-bottom: 24px; }.dock-count { font-size: 10px; min-width: 37px; }.dock-icon { min-width: 27px; } }
@media (max-width:600px) { .dock-count { display:none; }.editor-dock { gap:2px; }.dock-icon { min-width:26px; padding:0 2px; } }
@keyframes outline-in { from { opacity: .6; transform: translateX(-22px); } }
@media (prefers-reduced-motion: reduce) { .editor-layout, .outline-rail, .info-rail,.editor-layout.switching .writing-column,.editor-layout.switching .info-number { animation: none; transition: none; } }
</style>
