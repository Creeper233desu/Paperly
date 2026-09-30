<template>
  <view class="editor-screen" :class="[themeClass(), { immersive, 'ai-open': showAi, 'ai-fullscreen': aiFullscreen }]">
    <view class="editor-header">
      <view class="header-left">
        <text class="header-back" @tap="leave">‹</text>
        <view class="outline-trigger" @tap="showOutline = !showOutline">☰</view>
        <view class="header-titles">
          <text>{{ book?.title || $t('纸间') }}</text>
          <text>{{ chapter?.title || $t('正文') }}</text>
        </view>
      </view>
      <view class="header-right">
        <text class="save-label">{{ $t(saveStateText[saveState]) }}</text>
      <view
        class="header-tool pinch-lock"
        :class="{ on: !pinchLocked }"
        :aria-label="pinchLocked ? $t('解锁双指缩放') : $t('锁定双指缩放')"
        @tap="pinchLocked = !pinchLocked"
      >
        <view class="lock-glyph" :class="{ unlocked: !pinchLocked }">
          <view class="lock-shackle"></view>
          <view class="lock-body"></view>
          <view class="lock-keyhole"></view>
        </view>
      </view>
        <view class="header-tool more" :aria-label="$t('打开设置')" @tap="openSettings">
          <view class="gear-glyph">
            <view class="gear-tooth t1"></view>
            <view class="gear-tooth t2"></view>
            <view class="gear-tooth t3"></view>
            <view class="gear-tooth t4"></view>
            <view class="gear-tooth t5"></view>
            <view class="gear-tooth t6"></view>
            <view class="gear-ring"></view>
            <view class="gear-hole"></view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="showOutline" class="outline-backdrop" @tap="showOutline = false"></view>

    <view v-if="article" class="editor-layout" :class="{ switching }">
      <view class="outline-rail" :class="{ open: showOutline }">
        <view class="rail-top">
          <view class="rail-caption">{{ $t('篇章目录') }}</view>
          <text @tap="showOutline = false">×</text>
        </view>
        <view class="outline-scroll">
          <view v-for="(group, groupIndex) in book?.chapters || []" :key="group.id" class="outline-group">
            <view class="outline-chapter" :class="{ current: group.id === ids.chapter }" @tap="toggleChapter(group.id)">
              <text class="outline-caret">{{ collapsedChapters[group.id] ? '›' : '⌄' }}</text>
              <text>{{ groupIndex + 1 }}. {{ group.title }}</text>
              <text class="outline-count">{{ group.articles.length }}</text>
            </view>
            <view v-if="!collapsedChapters[group.id]" class="outline-articles">
              <view
                v-for="item in group.articles"
                :key="item.id"
                class="outline-item"
                :class="{ current: item.id === ids.article }"
                @tap="item.id !== ids.article ? openSibling(group.id, item.id) : showOutline = false"
              >{{ item.title || $t('无题正文') }}</view>
            </view>
          </view>
        </view>
        <view class="rail-bottom">{{ book?.chapters.length || 0 }} {{ $t('章 ·') }} {{ bookArticleCount }} {{ $t('篇') }}</view>
      </view>

      <view class="writing-column">
        <view class="writing-meta">
          <text>{{ chapter?.title }}</text>
          <text>{{ wordTotal }} {{ $t('字 ·') }} {{ paragraphCount }} {{ $t('段') }}</text>
        </view>
        <input class="article-name" :value="title" placeholder="" maxlength="100" @input="onTitle" @blur="saveNow" />
        <view class="writing-rule"></view>
        <view class="document-wrap">
          <DocumentInput
            :value="body"
            :images="images"
            :document-id="ids.article"
            :document-revision="documentRevision"
            :font-family="fontFamilyFor(prefs.font)"
            :font-size="prefs.fontSize"
            :pinch-enabled="!pinchLocked"
            :focus-mode="prefs.focus"
            :animated-cursor="prefs.animatedCursor"
            :cursor-style="prefs.cursorStyle"
            :cursor-trail-color="prefs.cursorTrailColor"
            :cursor-trail-length="prefs.cursorTrailLength"
            :cursor-request="cursorRequest"
            @blur="saveNow"
            @input="onDocumentInput"
            @cursor="onVisualCursor"
            @pinch="onPinch"
            @remove-image="removeImage"
            @ask-ai="onAskAi"
            @export-image="onExportSelection"
          />
        </view>
      </view>

      <view class="info-rail">
        <view class="status-summary">
          <view class="rail-caption">{{ $t('写作状态') }}</view>
          <view class="info-stat">
            <text class="info-number">{{ wordTotal }}</text>
            <text>{{ $t('当前字数') }}</text>
          </view>
          <view class="info-stat">
            <text class="info-number">{{ paragraphCount }}</text>
            <text>{{ $t('段落') }}</text>
          </view>
          <view class="info-note">{{ $t('文字会自动保存。目录中可随时切换篇章。') }}</view>
        </view>
        <view class="assistant-slot" :class="{ open: showAi }">
          <AiAssistant
            v-if="book"
            ref="aiRef"
            :book="book"
            :article-id="ids.article"
            :body="body"
            :selected-text="selectedContext"
            :system-prompt="prefs.aiSystemPrompt"
            :fullscreen="aiFullscreen"
            :open="showAi"
            @close="closeAi"
            @toggle-fullscreen="aiFullscreen = !aiFullscreen"
            @clear-selection="selectedContext = ''"
            @apply="applyAiProposal"
          />
        </view>
      </view>
    </view>

    <view class="editor-dock">
      <view class="dock-count">{{ wordTotal }} {{ $t('字') }}</view>
      <scroll-view class="dock-scroll" scroll-x :show-scrollbar="false">
        <view class="dock-scroll-content">
          <view class="dock-group">
            <view class="dock-icon" :aria-label="$t('撤销')" @tap="undo"><UiIcon name="undo" /></view>
            <view class="dock-icon" :aria-label="$t('重做')" @tap="redo"><UiIcon name="redo" /></view>
          </view>
          <view class="dock-divider"></view>
          <view class="dock-group symbols">
            <view class="dock-icon" @tap="insertSymbol('（','）')">（）</view>
            <view class="dock-icon" @tap="insertSymbol('“','”')">“”</view>
            <view class="dock-icon" @tap="insertSymbol('「','」')">「」</view>
          </view>
          <view class="dock-divider"></view>
          <view class="dock-icon" :aria-label="$t('换段')" @tap="appendParagraph"><UiIcon name="return" /></view>
          <view class="dock-icon image-dock" :aria-label="$t('插入图片')" @tap="openImageInsert"><UiIcon name="image" /></view>
        </view>
      </scroll-view>
      <view class="dock-fixed">
        <view class="dock-icon" :aria-label="$t('查找与替换')" @tap="showSearch = !showSearch"><UiIcon name="search" /></view>
        <view class="dock-icon" :class="{ active: prefs.focus }" :aria-label="$t('聚焦')" @tap="toggleFocus"><UiIcon name="focus" /></view>
        <view class="dock-icon font-dock" :class="{ active: showFontSize }" :aria-label="$t('调整字号')" @tap="showFontSize = !showFontSize">Aa</view>
        <view class="dock-icon ai-dock" :class="{ active: showAi }" :aria-label="$t('写作助手')" @tap="toggleAi"><AssistantGlyph name="sparkle" /></view>
        <view class="dock-icon" :aria-label="$t('沉浸模式')" @tap="immersive = !immersive">
          <UiIcon :name="immersive ? 'collapse' : 'expand'" />
        </view>
      </view>
    </view>

    <view v-if="showFontSize" class="font-size-panel">
      <FontSizeControl :value="prefs.fontSize" @change="onFontSlider" />
    </view>
    <ImageInsertSheet :visible="showImageInsert" @close="showImageInsert = false" @insert="addImage" />
    <view v-if="showSearch" class="search-panel">
      <view class="search-head">
        <text>{{ $t('查找与替换') }}</text>
        <text @tap="showSearch = false">{{ $t('完成') }}</text>
      </view>
      <view class="search-inputs">
        <input v-model="searchQuery" class="search-input" :placeholder="$t('查找文字')" confirm-type="search" @confirm="nextMatch" />
        <input v-model="replacement" class="search-input" :placeholder="$t('替换为')" />
      </view>
      <view class="search-actions">
        <text class="match-count">{{ matches.length ? $t('{current} / {total} 处', { current: Math.max(matchIndex + 1, 0), total: matches.length }) : $t('无匹配') }}</text>
        <text @tap="previousMatch">{{ $t('上一个') }}</text>
        <text @tap="nextMatch">{{ $t('下一个') }}</text>
        <text @tap="replaceCurrent">{{ $t('替换') }}</text>
        <text @tap="replaceEvery">{{ $t('全部替换') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onReady, onShow, onUnload } from '@dcloudio/uni-app'
import { addArticle, addChapter, deleteArticle, deleteChapter, getBook, getArticle, getChapter, renameArticle, renameChapter, saveArticle } from '../../src/store/library'
import { loadPreferences, themeClass, updatePreferences } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import DocumentInput from '../../components/DocumentInput.vue'
import AiAssistant from '../../components/AiAssistant.vue'
import AssistantGlyph from '../../components/AssistantGlyph.vue'
import { refreshAssistantProposals, registerAssistantEditor } from '../../src/store/assistant-sessions.js'
import { rebaseBookEdit, validateStructureProposal } from '../../src/services/assistant.js'
import { prepareImageExport } from '../../src/store/image-export-draft'
import ImageInsertSheet from '../../components/ImageInsertSheet.vue'
import FontSizeControl from '../../components/FontSizeControl.vue'
import UiIcon from '../../components/UiIcon.vue'
import { clampFontSize, scaleFontSize } from '../../src/utils/font-scale'
import { imageIdFromParagraph, insertImageAt, removeImageFromDocument, textOnlyDocument } from '../../src/utils/media'
import { documentFromParagraphs, editDocument, findMatches, paragraphOffset, paragraphsFromDocument, replaceAt, replaceAll, stepMatchIndex, stripLegacyIndents } from '../../src/utils/text'
import { t } from '../../src/i18n.js'

const ids = ref({ book: '', chapter: '', article: '' })
const documentRevision = ref(0)
const title = ref(''), body = ref(''), images = ref({}), cursorRequest = ref({ seq: 0, start: 0, end: 0 }), lastCursor = ref(0)
const showImageInsert = ref(false)
let imageInsertionCursor = 0
const saveStateText = { saved:'已保存', saving:'保存中…', failed:'保存失败' }
const showSearch = ref(false), showOutline = ref(false), showFontSize = ref(false), pinchLocked = ref(true), searchQuery = ref(''), replacement = ref(''), matchIndex = ref(-1), saveState = ref('saved'), immersive = ref(false), switching = ref(false)
const showAi = ref(false), aiFullscreen = ref(false), selectedContext = ref(''), aiRef = ref(null)
const collapsedChapters = reactive({})
const prefs = loadPreferences()
showAi.value = !!prefs.aiSidebarOpen
let timer = null, historyTimer = null, switchTimer = null, history = [], historyIndex = -1
let resumeCursor = null

function initialize(options) {
  ids.value = { book: options.bookId, chapter: options.chapterId, article: options.articleId }
  const item = getArticle(options.bookId, options.chapterId, options.articleId)
  if (item) {
    title.value = item.title
    images.value = { ...(item.images || {}) }
    const originalCursor = options.cursor == null ? null : Math.max(0, Number(options.cursor) || 0)
    const normalized = stripLegacyIndents(item.paragraphs, originalCursor)
    body.value = documentFromParagraphs(normalized.paragraphs)
    resumeCursor = normalized.cursor
    lastCursor.value = resumeCursor ?? 0
    history = [snapshot()]
    historyIndex = 0
  }
}

let unregisterAssistantEditor = null
onLoad(options => {
  initialize(options)
  unregisterAssistantEditor = registerAssistantEditor(options.bookId, {
    articleId: () => ids.value.article,
    body: () => body.value,
    applyText: ready => { commitHistory(); body.value = ready.after; focusAt(ready.cursor, undefined, { preserveScroll: true }); commitHistory(); saveNow() },
    onStructure: proposal => {
      const { name, args } = proposal.operation
      if (name === 'rename_article' && args.article_id === ids.value.article) title.value = args.title
      if ((name === 'delete_chapter' && args.chapter_id === ids.value.chapter) || (name === 'delete_article' && args.article_id === ids.value.article)) uni.navigateBack()
    }
  })
})
onReady(() => { if (resumeCursor !== null) focusAt(Math.min(resumeCursor, body.value.length)) })
onShow(() => { loadSelectedFont().catch(() => {}) })
onUnload(() => { clearTimeout(historyTimer); clearTimeout(timer); clearTimeout(switchTimer); saveNow(); unregisterAssistantEditor?.() })

const article = computed(() => getArticle(ids.value.book, ids.value.chapter, ids.value.article))
const chapter = computed(() => getChapter(ids.value.book, ids.value.chapter))
const book = computed(() => getBook(ids.value.book))
const paragraphs = computed(() => paragraphsFromDocument(body.value))
const paragraphCount = computed(() => paragraphs.value.filter(item => !imageIdFromParagraph(item)).length)
const wordTotal = computed(() => textOnlyDocument(body.value).replace(/\s/g, '').length)
const bookArticleCount = computed(() => book.value?.chapters.reduce((sum, group) => sum + group.articles.length, 0) || 0)
const matches = computed(() => findMatches(paragraphs.value, searchQuery.value))
watch(searchQuery, () => { matchIndex.value = -1 })

function snapshot() { return JSON.stringify({ title: title.value, body: body.value, images: images.value }) }
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
  title.value = data.title; body.value = data.body; images.value = data.images || {}
  focusAt(Math.min(lastCursor.value, body.value.length), undefined, { preserveScroll: true })
  scheduleSave()
}
function undo() { clearTimeout(historyTimer); commitHistory(); if (historyIndex > 0) { historyIndex -= 1; restoreHistory(historyIndex) } }
function redo() { clearTimeout(historyTimer); if (historyIndex < history.length - 1) { historyIndex += 1; restoreHistory(historyIndex) } }
function scheduleSave() { saveState.value = 'saving'; clearTimeout(timer); timer = setTimeout(saveNow, 350) }
function saveNow() { clearTimeout(timer); if (!ids.value.article) return; try { saveArticle(ids.value.book, ids.value.chapter, ids.value.article, { title: title.value, paragraphs: paragraphs.value, images: images.value, cursor: lastCursor.value }); saveState.value = 'saved' } catch (_) { saveState.value = 'failed'; uni.showToast({ title: t('保存失败，请检查存储空间'), icon: 'none' }) } }
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
function openImageInsert() { imageInsertionCursor = lastCursor.value; showImageInsert.value = true }
function addImage(image) {
  try {
    const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    commitHistory()
    images.value = { ...images.value, [id]: image }
    const next = insertImageAt(body.value, imageInsertionCursor, id)
    body.value = next.text
    focusAt(next.cursor, undefined, { preserveScroll: true })
    commitHistory(); scheduleSave()
  } catch (error) { if (!String(error.message).includes('取消')) uni.showToast({ title: error.message || t('插入图片失败'), icon: 'none' }) }
}
function removeImage(id) {
  if (!images.value[id]) return
  commitHistory()
  body.value = removeImageFromDocument(body.value, id)
  const copy = { ...images.value }; delete copy[id]; images.value = copy
  focusAt(Math.min(lastCursor.value, body.value.length), undefined, { preserveScroll: true })
  commitHistory(); scheduleSave()
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
  images.value = { ...(item.images || {}) }
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
function onFontSlider(size) { updatePreferences({ fontSize: clampFontSize(size, prefs.fontSize) }) }
function onPinch(scale) { if (!pinchLocked.value) updatePreferences({ fontSize: scaleFontSize(prefs.fontSize, scale) }) }
function toggleAi() { if (immersive.value) immersive.value = false; showOutline.value = false; showAi.value = !showAi.value; updatePreferences({ aiSidebarOpen: showAi.value }); if (!showAi.value) aiFullscreen.value = false }
function closeAi() { showAi.value = false; aiFullscreen.value = false; updatePreferences({ aiSidebarOpen: false }) }
function onAskAi(selection) { selectedContext.value = selection?.text || ''; immersive.value = false; showOutline.value = false; showAi.value = true; updatePreferences({ aiSidebarOpen: true }) }
function onExportSelection(selection) {
  if (selection?.documentId !== ids.value.article || !selection.text?.trim()) return
  if (selection.text.includes('\uFFFCimage:')) return uni.showToast({ title: t('图片不能导出到文字卡片'), icon: 'none' })
  saveNow()
  const start = textOnlyDocument(body.value.slice(0, selection.start)).length
  prepareImageExport({ bookId: ids.value.book, chapterId: ids.value.chapter, articleId: ids.value.article, start, end: start + selection.text.length, text: selection.text })
  uni.navigateTo({ url: `/pages/export-image/index?bookId=${encodeURIComponent(ids.value.book)}&source=selection` })
}
function applyAiProposal(index) {
  const proposal = aiRef.value?.getProposal(index)
  if (!proposal || proposal.status === 'accepted' || proposal.status === 'rejected' || proposal.error) return
  if (proposal.kind === 'structure') {
    saveNow()
    if (!validateStructureProposal(book.value, proposal)) return uni.showToast({ title: t('篇章已变化，请重新生成提案'), icon: 'none' })
    const { name, args } = proposal.operation
    if (name === 'add_chapter') addChapter(ids.value.book, args.title, args.assigned_id)
    else if (name === 'delete_chapter') deleteChapter(ids.value.book, args.chapter_id)
    else if (name === 'rename_chapter') renameChapter(ids.value.book, args.chapter_id, args.title)
    else if (name === 'add_article') addArticle(ids.value.book, args.chapter_id, args.title, args.assigned_id)
    else if (name === 'delete_article') deleteArticle(ids.value.book, proposal.chapterId, args.article_id)
    else if (name === 'rename_article') {
      renameArticle(ids.value.book, proposal.chapterId, args.article_id, args.title)
      if (args.article_id === ids.value.article) title.value = args.title
    }
    aiRef.value.acceptProposal(index)
    if ((name === 'delete_chapter' && args.chapter_id === ids.value.chapter) || (name === 'delete_article' && args.article_id === ids.value.article)) return uni.navigateBack()
    refreshAssistantProposals(book.value, ids.value.article, body.value)
    return uni.showToast({ title: t('已应用篇章修改'), icon: 'none' })
  }
  const target = getArticle(ids.value.book, proposal.chapterId, proposal.articleId)
  const latest = proposal.articleId === ids.value.article ? body.value : documentFromParagraphs(target?.paragraphs)
  if (!target) return uni.showToast({ title: t('目标正文已不存在'), icon: 'none' })
  let ready = proposal
  if (latest !== proposal.before || proposal.error) {
    try { ready = rebaseBookEdit(book.value, proposal, ids.value.article, body.value) }
    catch (error) { return uni.showToast({ title: t('无法安全应用：{error}', { error:error.message }), icon: 'none' }) }
  }
  if (proposal.articleId === ids.value.article) {
    commitHistory()
    body.value = ready.after
    focusAt(ready.cursor, undefined, { preserveScroll: true })
    commitHistory(); saveNow()
  } else saveArticle(ids.value.book, ready.chapterId, ready.articleId, { paragraphs: ready.paragraphs, cursor: ready.cursor })
  aiRef.value.acceptProposal(index)
  refreshAssistantProposals(book.value, ids.value.article, body.value)
  uni.showToast({ title: t('已应用修改'), icon: 'none' })
}
function showMatch(index) { if (!matches.value.length) return; matchIndex.value = (index + matches.value.length) % matches.value.length; const match = matches.value[matchIndex.value]; focusAt(paragraphOffset(paragraphs.value, match.paragraphIndex, match.end), undefined, { animate: true, reveal: true, preserveScroll: false }) }
function nextMatch() { showMatch(stepMatchIndex(matchIndex.value, matches.value.length, 1)) }
function previousMatch() { showMatch(stepMatchIndex(matchIndex.value, matches.value.length, -1)) }
function replaceCurrent() { if (!matches.value.length) return; if (matchIndex.value < 0) matchIndex.value = 0; const match = matches.value[matchIndex.value]; const updated = replaceAt(paragraphs.value, match, replacement.value); body.value = documentFromParagraphs(updated); focusAt(paragraphOffset(updated, match.paragraphIndex, match.start + replacement.value.length)); matchIndex.value = -1; scheduleHistory(); scheduleSave() }
function replaceEvery() { if (!searchQuery.value) return; const result = replaceAll(paragraphs.value, searchQuery.value, replacement.value); body.value = documentFromParagraphs(result.paragraphs); scheduleHistory(); scheduleSave(); uni.showToast({ title: t('已替换 {count} 处', { count:result.count }), icon: 'none' }) }
</script>

<style scoped>
.editor-screen { --writer-bg: var(--bg); --writer-text: var(--text); min-height: 100vh; background: var(--writer-bg); color: var(--writer-text); padding: var(--status-bar-height) 24px 120px; transition: background .25s ease; }.editor-screen.theme-dark { --writer-bg: #0d0f13; --writer-text: #f0f0ee; }
.editor-header { width: 100%; max-width: 1440px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }.header-left, .header-right { display: flex; align-items: center; gap: 13px; }.header-back { font-size: 32px; padding: 0 10px 5px 0; line-height: 1; }.header-titles { display: flex; flex-direction: column; gap: 3px; font-size: 13px; font-weight: 650; }.header-titles text:last-child { color: var(--muted); font-size: 11px; font-weight: 400; }.header-right { font-size: 12px; }.save-label { color: var(--muted); margin-right: 8px; }.header-tool { padding: 9px 12px; border: 1px solid var(--line); border-radius: 11px; color: var(--muted); }.header-tool.on { color: var(--accent); background: var(--accent-soft); }

/* 让 pinch-lock 与设置按钮尺寸一致 */
.pinch-lock,
.header-tool.more {
  width: 39px;
  height: 39px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
/* 自绘锁图标 */
.lock-glyph {
  position: relative;
  width: 19px;
  height: 19px;
  color: currentColor;
}

/* 锁梁（半圆环） */
.lock-shackle {
  position: absolute;
  left: 50%;
  top: 0;
  width: 9px;
  height: 8px;
  margin-left: -4.5px;
  border: 1.8px solid currentColor;
  border-bottom: none;
  border-radius: 5px 5px 0 0;
  box-sizing: border-box;
  transform-origin: 100% 100%;
  transition: transform .32s cubic-bezier(.2,.8,.2,1);
}

/* 解锁时锁梁向右上方掀起 */
.lock-glyph.unlocked .lock-shackle {
  transform: translateX(1px) rotate(38deg);
}

/* 锁体 */
.lock-body {
  position: absolute;
  left: 1px;
  right: 1px;
  bottom: 1px;
  height: 10px;
  border: 1.8px solid currentColor;
  border-radius: 2.5px;
  box-sizing: border-box;
  background: transparent;
}

/* 锁孔 */
.lock-keyhole {
  position: absolute;
  left: 50%;
  bottom: 4.5px;
  width: 2px;
  height: 4px;
  margin-left: -1px;
  border-radius: 1px;
  background: currentColor;
}
/* 自绘齿轮图标 */
.header-tool.more {
  transition: color .2s ease, background .2s ease, border-color .2s ease;
}
.header-tool.more:active {
  color: var(--accent);
  background: var(--accent-soft);
}
.gear-glyph {
  position: relative;
  width: 19px;
  height: 19px;
  transition: transform .32s cubic-bezier(.2,.8,.2,1);
}
.header-tool.more:active .gear-glyph {
  transform: rotate(60deg);
}
.gear-ring {
  position: absolute;
  inset: 3.5px;
  border: 1.8px solid currentColor;
  border-radius: 50%;
  box-sizing: border-box;
}
.gear-hole {
  position: absolute;
  inset: 7.5px;
  border-radius: 50%;
  background: currentColor;
  opacity: .9;
}
.gear-tooth {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 4px;
  margin-left: -1.5px;
  border-radius: 1px;
  background: currentColor;
  transform-origin: 50% 9.5px;
}
.gear-tooth.t1 { transform: translateY(-9.5px) rotate(0deg); }
.gear-tooth.t2 { transform: translateY(-9.5px) rotate(60deg); }
.gear-tooth.t3 { transform: translateY(-9.5px) rotate(120deg); }
.gear-tooth.t4 { transform: translateY(-9.5px) rotate(180deg); }
.gear-tooth.t5 { transform: translateY(-9.5px) rotate(240deg); }
.gear-tooth.t6 { transform: translateY(-9.5px) rotate(300deg); }

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
.ai-open .info-rail { position:fixed; z-index:23; right:24px; top:calc(var(--status-bar-height) + 98px); bottom:calc(94px + env(safe-area-inset-bottom)); width:min(350px,32vw); height:auto; max-height:760px; padding:0; border-radius:16px; background:transparent; box-shadow:none; opacity:1; transform:translateX(0); pointer-events:auto; transition:right .38s cubic-bezier(.22,.8,.22,1),top .38s cubic-bezier(.22,.8,.22,1),bottom .38s cubic-bezier(.22,.8,.22,1),width .38s cubic-bezier(.22,.8,.22,1),height .38s cubic-bezier(.22,.8,.22,1),background .38s ease,padding .38s ease; }
.ai-open .assistant-slot.open { height:calc(100% - 62px); max-height:none; }
.ai-open .assistant-slot :deep(.assistant-panel) { height:100%; min-height:0; }
.ai-fullscreen .info-rail { right:12px; top:calc(var(--status-bar-height) + 8px); bottom:12px; width:calc(100vw - 24px); height:calc(100vh - var(--status-bar-height) - 20px); max-height:none; box-sizing:border-box; padding:12px; background:var(--bg); box-shadow:0 20px 70px var(--shadow); border:1px solid var(--line); }
.ai-fullscreen .assistant-slot.open { height:calc(100% - 62px); max-height:none; }
.ai-fullscreen .assistant-slot :deep(.assistant-panel) { height:100%; max-height:none; }
.ai-fullscreen .editor-dock { opacity:0; pointer-events:none; transform:translate(-50%,90px); }
@media(max-width:760px){ .ai-open .info-rail { top:var(--status-bar-height); bottom:calc(94px + env(safe-area-inset-bottom)); right:0; width:min(370px,94vw); height:calc(100vh - var(--status-bar-height) - 94px - env(safe-area-inset-bottom)); max-height:none; padding:12px; border-radius:20px 0 0 20px; background:var(--surface); box-shadow:-20px 0 65px var(--shadow); }.ai-fullscreen .info-rail { top:calc(var(--status-bar-height) + 4px); right:4px; bottom:4px; width:calc(100vw - 8px); height:calc(100vh - var(--status-bar-height) - 8px); border-radius:18px; }.ai-fullscreen .assistant-slot.open { height:calc(100% - 62px); max-height:none; } }
.ai-dock { display:flex; align-items:center; justify-content:center; transition:background .28s ease,color .28s ease,transform .28s cubic-bezier(.2,.8,.2,1),box-shadow .28s ease; }
.image-dock { position:relative; }
.picture-glyph { position:relative; width:19px; height:16px; border:1.8px solid currentColor; border-radius:3px; box-sizing:border-box; overflow:hidden; }
.picture-sun { position:absolute; width:4px; height:4px; top:3px; right:3px; border-radius:50%; background:currentColor; }
.picture-land { position:absolute; width:15px; height:10px; left:1px; bottom:-5px; border-top:2px solid currentColor; transform:rotate(-34deg); }
.picture-plus { position:absolute; width:10px; height:10px; right:2px; bottom:4px; border-radius:50%; background:var(--surface); }
.picture-plus::before,.picture-plus::after { content:''; position:absolute; background:currentColor; border-radius:1px; }
.picture-plus::before { width:8px; height:1.5px; left:1px; top:4px; }.picture-plus::after { width:1.5px; height:8px; left:4px; top:1px; }
.ai-dock:active { transform:scale(.86); }
.ai-dock :deep(.glyph) { width:20px; height:20px; transition:transform .35s cubic-bezier(.2,.8,.2,1); }
.ai-dock.active :deep(.glyph) { transform:rotate(30deg) scale(1.1); }
@media (prefers-reduced-motion:reduce) { .ai-dock,.ai-dock :deep(.glyph) { transition:none; } }
.editor-header { position:sticky; top:var(--status-bar-height); z-index:21; box-sizing:border-box; background:var(--writer-bg); border-bottom:1px solid transparent; transition:background .25s ease,opacity .2s ease; }
.editor-dock { width:min(650px,calc(100vw - 32px)); box-sizing:border-box; }
.dock-scroll { min-width:0; flex:1; white-space:nowrap; }
.dock-scroll-content { width:max-content; display:flex; align-items:center; gap:9px; }
.dock-fixed { display:flex; align-items:center; flex:none; border-left:1px solid var(--line); padding-left:6px; gap:2px; }
.font-dock { font-size:14px; font-weight:700; letter-spacing:-.04em; }
.font-size-panel { position:fixed; z-index:15; right:max(24px,calc((100vw - 900px)/2)); bottom:calc(88px + env(safe-area-inset-bottom)); width:min(290px,calc(100vw - 34px)); box-sizing:border-box; padding:16px 20px 10px; border:1px solid var(--line); border-radius:18px; background:var(--surface); box-shadow:0 20px 55px var(--shadow); animation:panel-in .2s ease both; }
.font-size-title,.font-size-range { display:flex; justify-content:space-between; color:var(--text); font-size:13px; font-weight:650; }
.font-size-range { color:var(--muted); font-size:10px; font-weight:400; }
@media(max-width:760px) { .editor-layout,.ai-open .editor-layout,.immersive .editor-layout,.ai-open.immersive .editor-layout { display:block; width:100%; max-width:100%; }
  .writing-column { width:100%; min-width:0; }
  .immersive .outline-rail:not(.open),.immersive .info-rail { display:none; }
}
@media(max-width:600px) { .editor-dock { box-sizing:border-box; justify-content:initial; gap:4px; overflow:hidden; }
  .dock-scroll-content { gap:5px; }.dock-scroll .dock-group { flex:none; }.dock-scroll .dock-icon { min-width:31px; padding:0 4px; }
  .dock-fixed { gap:0; padding-left:3px; }.dock-fixed .dock-icon { min-width:30px; padding:0 1px; }
  .font-size-panel { right:10px; }
}
.editor-dock { box-shadow:0 8px 34px var(--shadow),inset 0 1px 0 rgba(255,255,255,.06); }.dock-icon { transition:background .2s ease,color .2s ease,transform .2s cubic-bezier(.2,.8,.2,1); }.dock-icon:active { transform:scale(.88); }.image-dock { background:transparent; color:var(--muted); }.dock-icon.active { box-shadow:inset 0 1px 0 rgba(255,255,255,.1); }
@media(prefers-reduced-motion:reduce) { .dock-icon { transition:none; } }
</style>
