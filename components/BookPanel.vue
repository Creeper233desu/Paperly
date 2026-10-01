<template>
  <view class="screen book-screen" :class="[themeClass(), `motion-${motion}`, { 'shared-hidden':hideShared }]"><view class="page-wrap">
    <view class="topbar book-rest"><text class="back" @tap="back">{{ $t('‹　返回书架') }}</text><view class="book-top-menu" @tap="openBookMenu"><text>{{ $t('更多操作') }}</text><MoreIcon /></view></view>
    <view v-if="book" class="book-layout"><view class="book-sidebar book-rest"><BookCover class="large-cover" :src="book.cover" :title="book.title" :color="coverColor" letter-class="large-letter" spine-class="large-spine" @load="coverReady" @error="coverReady" /><view class="sidebar-label">{{ $t('当前书籍') }}</view><view class="sidebar-title">{{ book.title }}</view><view class="sidebar-author">{{ book.author || $t('未设置作者') }}</view><view v-if="book.description" class="sidebar-description">{{ book.description }}</view><view v-if="!book.readOnly" class="sidebar-stats"><view><text class="stat-number">{{ book.chapters.length }}</text><text>{{ $t('章节') }}</text></view><view><text class="stat-number">{{ totalArticles }}</text><text>{{ $t('正文') }}</text></view><view><text class="stat-number">{{ totalWords }}</text><text>{{ $t('字数') }}</text></view></view><view class="sidebar-exports"><view v-if="!book.readOnly || book.readOnly.format === 'pdf'" class="sidebar-export" @tap="readBook">{{ book.readOnly ? $t('转换为可编辑书籍') : $t('阅读整本书') }}</view><view v-if="!book.readOnly" class="sidebar-export" @tap="openPdfExport">{{ $t('导出 PDF　↗') }}</view><view v-if="!book.readOnly" class="sidebar-export" @tap="openImageExport">{{ $t('导出图片　↗') }}</view></view></view>
      <view v-if="book.readOnly" class="book-content read-only-content book-rest"><view class="page-title">{{ $t('继续整理这份文稿') }}</view><view class="subtle">{{ book.readOnly.format === 'pdf' ? $t('将旧版导入的 PDF 提取为章节和正文，之后即可编辑、缩放字体和阅读。') : $t('此旧版文件格式已停止支持，可删除这条书架记录后导入 DOCX 或 PDF。') }}</view><view v-if="book.readOnly.format === 'pdf'" class="read-only-card card"><UiIcon name="file" /><view class="read-only-name">{{ book.readOnly.fileName }}</view><view class="primary-button" @tap="convertPdf">{{ $t('转换为可编辑书籍') }}</view></view></view>
      <view v-else class="book-content book-rest"><view class="content-heading"><view><view class="eyebrow">{{ $t('写作目录') }}</view><view class="page-title">{{ $t('章节与正文') }}</view><view class="subtle">{{ $t('继续写下一个片段，或从已有的正文开始。') }}</view></view><view class="new-chapter" @tap="openCreateChapter">{{ $t('＋ 新建章节') }}</view></view><view class="search-box" @tap="interact"><text>⌕</text><input v-model="query" :placeholder="$t('搜索章节、篇名或正文')" confirm-type="search" /></view><view v-if="lastEdited" class="resume-card" @tap="resumeWriting"><view class="resume-mark"><view class="resume-line"></view></view><view class="resume-copy"><text>{{ $t('继续上次写作') }}</text><strong>{{ lastEdited.title }}</strong></view><view class="resume-arrow"></view></view>
      <view v-if="!book.chapters.length" class="empty card">{{ $t('先创建一个章节，再写第一篇正文。') }}</view><view v-for="(chapter, ci) in visibleChapters" :key="chapter.id" class="chapter-card card"><view class="chapter-heading" @tap="toggleChapter(chapter.id)"><view class="chapter-num">{{ String(ci + 1).padStart(2, '0') }}</view><view class="chapter-name">{{ chapter.title }} <text class="chapter-article-count">{{ chapter.articles.length }} {{ $t('篇') }}</text></view><view class="chapter-caret" :class="{ folded: collapsed[chapter.id] && !query }"></view><MoreIcon class="chapter-action" @tap.stop="openChapterMenu(chapter)" /></view><view v-if="query || !collapsed[chapter.id]" class="chapter-children"><view v-for="article in filteredArticles(chapter)" :key="article.id" class="article-row" @tap="openArticle(chapter.id, article.id)" @longpress="openArticleMenu(chapter, article)"><view class="article-icon"><view></view><view></view></view><view class="article-main"><view class="article-title">{{ article.title || $t('无题正文') }}</view><view class="article-preview">{{ preview(article) }}</view></view><view class="article-tail"><text>{{ wordCount(article) }} {{ $t('字') }}</text><MoreIcon class="article-more" @tap.stop="openArticleMenu(chapter, article)" /></view></view><view class="add-article" @tap="startArticle(chapter.id)">{{ $t('＋ 添加正文') }}</view></view></view><view v-if="query && !visibleChapters.length" class="empty">{{ $t('没有找到匹配内容') }}</view></view>
    </view>
  </view>
  <PdfImportBridge ref="pdfBridge" @progress="conversionProgress = $t('正在提取第 {current} / {total} 页', $event)" />
  <AppSheet :visible="converting" :title="$t('转换 PDF')" :subtitle="conversionProgress" @close="pdfBridge?.cancel()"><view class="subtle">{{ $t('完成后，原有书名、作者和封面会保留。') }}</view></AppSheet>
  <AppDialog :visible="!!conversionError" :title="$t('PDF 转换提示')" :message="conversionError" :confirm-text="$t('知道了')" @cancel="conversionError = ''" @confirm="conversionError = ''" />
  <ActionMenu :visible="!!menuType && !dialogType" :title="menuTitle" :items="menuItems" @close="menuType = ''" @select="onMenuSelect" />
  <AppDialog :visible="dialogType === 'chapter'" :title="chapterDraftId ? $t('重命名章节') : $t('新建章节')" :confirm-text="chapterDraftId ? $t('保存') : $t('创建章节')" @cancel="dialogType = ''" @confirm="saveChapter"><input v-model="chapterDraftTitle" class="field" maxlength="80" :placeholder="$t('章节名（必填）')" /></AppDialog>
  <AppDialog :visible="dialogType === 'book'" :title="$t('编辑书籍信息')" :confirm-text="$t('保存')" @cancel="dialogType = ''" @confirm="saveBookInfo"><view class="book-edit"><view class="cover-edit" @tap="selectCover"><image v-if="bookDraft.cover" :src="bookDraft.cover" mode="aspectFill" /><view v-else class="cover-edit-placeholder">＋<text>{{ $t('选择封面') }}</text></view></view><view class="book-fields"><input v-model="bookDraft.title" class="field" maxlength="80" :placeholder="$t('书名')" /><input v-model="bookDraft.author" class="field" maxlength="80" :placeholder="$t('作者')" /><textarea v-model="bookDraft.description" class="description-input" maxlength="240" :placeholder="$t('简介')" /></view></view></AppDialog>
  <AppDialog :visible="dialogType === 'deleteChapter'" :title="$t('删除章节')" :message="$t('确定删除「{title}」和其中全部正文？', { title: selectedChapter?.title || '' })" :confirm-text="$t('删除章节')" :destructive="true" @cancel="dialogType = ''" @confirm="confirmDeleteChapter" />
  <AppDialog :visible="dialogType === 'deleteArticle'" :title="$t('删除正文')" :message="$t('确定删除「{title}」？', { title: selectedArticle?.title || $t('无题正文') })" :confirm-text="$t('删除正文')" :destructive="true" @cancel="dialogType = ''" @confirm="confirmDeleteArticle" />
  <AppDialog :visible="showExport" :title="$t('导出整本书')" :confirm-text="$t('生成 PDF')" @cancel="showExport = false" @confirm="doExport"><view class="export-row" @tap="withToc = !withToc"><view><view>{{ $t('包含目录') }}</view><text>{{ $t('按章节生成导航页') }}</text></view><view class="custom-check" :class="{ checked: withToc }">{{ withToc ? '✓' : '' }}</view></view></AppDialog>
  <AppDialog :visible="!!exportResult" :title="exportResult?.ok ? $t('PDF 已生成') : $t('导出失败')" :message="exportResult?.message" :confirm-text="exportResult?.ok ? $t('打开 PDF') : $t('知道了')" @cancel="exportResult = null" @confirm="openExport" />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import BookCover from './BookCover.vue'
import { getBook, replaceImportedContent, getLastEditedArticle, updateBook, addChapter, renameChapter, deleteChapter, addArticle, deleteArticle, wordCount } from '../src/store/library'
import { themeClass } from '../src/store/preferences'
import { chooseBookCover } from '../src/services/covers'
import { exportBookPdf } from '../src/services/pdf'
import { mirrorExport } from '../src/services/data-directory.js'
import { textOnlyParagraphs } from '../src/utils/media'
import PdfImportBridge from './PdfImportBridge.vue'
import { buildPdfBook } from '../src/services/pdf-import'
import { removeImportedFile } from '../src/services/android-pdf-picker'
import AppSheet from './AppSheet.vue'
import UiIcon from './UiIcon.vue'
import MoreIcon from './MoreIcon.vue'
import ActionMenu from './ActionMenu.vue'
import AppDialog from './AppDialog.vue'
import { t } from '../src/i18n.js'

const pdfBridge = ref(null), converting = ref(false), conversionProgress = ref(''), conversionError = ref('')
const props = defineProps({ bookId:String, motion:{ type:String, default:'none' }, hideShared:Boolean, coverColor:String })
const emit = defineEmits(['close', 'interact', 'cover-ready'])
function coverReady(src) { emit('cover-ready', src) }
const bookId = computed(() => props.bookId)
const query = ref(''), menuType = ref(''), dialogType = ref(''), showExport = ref(false), withToc = ref(true), exportResult = ref(null)
const collapsed = reactive({})
const selectedChapter = ref(null), selectedArticle = ref(null), chapterDraftId = ref(''), chapterDraftTitle = ref('')
const bookDraft = reactive({ title: '', author: '', description: '', cover: '' })
const book = computed(() => getBook(bookId.value))
const lastEdited = computed(() => getLastEditedArticle(book.value))
const totalArticles = computed(() => book.value?.chapters.reduce((n, c) => n + c.articles.length, 0) || 0)
const totalWords = computed(() => book.value?.chapters.reduce((n, c) => n + c.articles.reduce((a, item) => a + wordCount(item), 0), 0) || 0)
const articleMatches = a => (a.title + '\n' + textOnlyParagraphs(a.paragraphs).join('\n')).toLocaleLowerCase().includes(query.value.toLocaleLowerCase())
const visibleChapters = computed(() => book.value?.chapters.filter(ch => !query.value || ch.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()) || ch.articles.some(articleMatches)) || [])
const filteredArticles = ch => !query.value || ch.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()) ? ch.articles : ch.articles.filter(articleMatches)
const preview = a => textOnlyParagraphs(a.paragraphs).find(p => p.trim()) || t(Object.keys(a.images || {}).length ? '包含图片' : '还没有正文')
const menuTitle = computed(() => menuType.value === 'book' ? book.value?.title : menuType.value === 'chapter' ? selectedChapter.value?.title : selectedArticle.value?.title || t('无题正文'))
const menuItems = computed(() => menuType.value === 'book' ? (book.value?.readOnly ? [{ label: t('编辑书籍信息') }, ...(book.value.readOnly.format === 'pdf' ? [{ label: t('转换为可编辑书籍') }] : [])] : [{ label: t('编辑书籍信息') }, { label: t('阅读整本书') }, { label: t('导出 PDF') }, { label: t('导出图片') }]) : menuType.value === 'chapter' ? [{ label: t('重命名章节') }, { label: t('删除章节'), danger: true }] : [{ label: t('删除正文'), danger: true }])
function back() { emit('close') }
function interact() { emit('interact') }
function openPdfExport() { interact(); showExport.value = true }
function dismissOverlay() {
  if (dialogType.value) { dialogType.value = ''; return true }
  if (menuType.value) { menuType.value = ''; return true }
  if (showExport.value) { showExport.value = false; return true }
  if (exportResult.value) { exportResult.value = null; return true }
  if (conversionError.value) { conversionError.value = ''; return true }
  if (converting.value) { pdfBridge.value?.cancel(); return true }
  return false
}
defineExpose({ dismissOverlay })
function openBookMenu() { interact(); if (book.value) menuType.value = 'book' }
function openChapterMenu(chapter) { interact(); selectedChapter.value = chapter; menuType.value = 'chapter' }
function toggleChapter(id) { interact(); collapsed[id] = !collapsed[id] }
function openArticleMenu(chapter, article) { interact(); selectedChapter.value = chapter; selectedArticle.value = article; menuType.value = 'article' }
function onMenuSelect(index) {
  const type = menuType.value; menuType.value = ''
  if (type === 'book' && index === 0) { Object.assign(bookDraft, { title: book.value.title, author: book.value.author || '', description: book.value.description || '', cover: book.value.cover || '' }); dialogType.value = 'book' }
  if (type === 'book' && index === 1) readBook()
  if (type === 'book' && !book.value?.readOnly && index === 2) showExport.value = true
  if (type === 'book' && !book.value?.readOnly && index === 3) openImageExport()
  if (type === 'chapter' && index === 0) { chapterDraftId.value = selectedChapter.value.id; chapterDraftTitle.value = selectedChapter.value.title; dialogType.value = 'chapter' }
  if (type === 'chapter' && index === 1) dialogType.value = 'deleteChapter'
  if (type === 'article') dialogType.value = 'deleteArticle'
}
function openCreateChapter() { interact(); chapterDraftId.value = ''; chapterDraftTitle.value = ''; dialogType.value = 'chapter' }
function saveChapter() { if (!chapterDraftTitle.value.trim()) return uni.showToast({ title: t('请输入章节名'), icon: 'none' }); if (chapterDraftId.value) renameChapter(bookId.value, chapterDraftId.value, chapterDraftTitle.value); else addChapter(bookId.value, chapterDraftTitle.value); dialogType.value = '' }
async function selectCover() { try { bookDraft.cover = await chooseBookCover() } catch (error) { if (!String(error.message).includes('取消')) uni.showToast({ title: error.message, icon: 'none' }) } }
function saveBookInfo() { if (!bookDraft.title.trim()) return uni.showToast({ title: t('请输入书名'), icon: 'none' }); updateBook(bookId.value, bookDraft); dialogType.value = '' }
function confirmDeleteChapter() { deleteChapter(bookId.value, selectedChapter.value.id); dialogType.value = '' }
function confirmDeleteArticle() { deleteArticle(bookId.value, selectedChapter.value.id, selectedArticle.value.id); dialogType.value = '' }
function startArticle(chapterId) { const a = addArticle(bookId.value, chapterId); openArticle(chapterId, a.id) }
function resumeWriting() { if (lastEdited.value) openArticle(lastEdited.value.chapterId, lastEdited.value.articleId, lastEdited.value.cursor) }
function openArticle(chapterId, articleId, cursor = 0) { interact(); if (!menuType.value && !book.value?.readOnly) uni.navigateTo({ url: `/pages/editor/index?bookId=${bookId.value}&chapterId=${chapterId}&articleId=${articleId}&cursor=${cursor}` }) }
function readBook() { interact(); if (book.value?.readOnly) return convertPdf(); if (book.value) uni.navigateTo({ url: `/pages/reader/index?bookId=${encodeURIComponent(bookId.value)}` }) }
function openImageExport() { interact(); uni.navigateTo({ url: `/pages/export-image/index?bookId=${bookId.value}` }) }
async function doExport() {
  showExport.value = false
  try {
    const path = exportBookPdf(book.value, withToc.value)
    try { await mirrorExport(path, 'pdf'); exportResult.value = { ok:true, path, message:t('PDF 已保存在 Documents/PaperWriter/exports 中。') } }
    catch (copyError) { exportResult.value = { ok:true, path, message:t('PDF 已生成，但复制到数据目录失败：{error}', { error:copyError.message || copyError }) } }
  }
  catch (error) { exportResult.value = { ok: false, message: error.message || String(error) } }
}
function openExport() {
  const result = exportResult.value; exportResult.value = null
  if (result?.ok && typeof plus !== 'undefined') plus.runtime.openFile(result.path, {}, () => uni.showToast({ title: t('请安装可以打开 PDF 的应用'), icon: 'none' }))
}
async function convertPdf() {
  interact()
  if (converting.value || book.value?.readOnly?.format !== 'pdf') return
  const source = { ...book.value.readOnly }
  converting.value = true; conversionProgress.value = t('正在读取原文件')
  try {
    const result = await pdfBridge.value.parse({ path: source.path })
    const content = buildPdfBook(result.pages, result.metadata, source.fileName)
    replaceImportedContent(bookId.value, content)
    removeImportedFile(source.path)
    if (content.warnings.length) conversionError.value = content.warnings.join('\n')
  } catch (error) { if (!String(error.message).includes('取消')) conversionError.value = error.message || t('转换失败') }
  finally { converting.value = false }
}
</script>

<style scoped>
.book-screen { padding-bottom: 45px; }
.book-screen:not(.motion-none) { background:transparent; }
.motion-live :deep(.dialog-backdrop),.motion-live :deep(.menu-backdrop),.motion-live :deep(.sheet-mask) { pointer-events:auto; }
.shared-hidden .large-cover,.shared-hidden .sidebar-title,.shared-hidden .sidebar-author { visibility:hidden; }
.book-rest { opacity:1; }
.book-top-menu { display: flex; align-items: center; gap: 4px; color: var(--accent); font-size: 14px; }
.book-layout { display: grid; grid-template-columns: 290px minmax(0,1fr); gap: 48px; margin-top: 25px; }.book-sidebar { padding: 24px; border-radius: 26px; background: var(--surface); border: 1px solid var(--line); height: fit-content; }.large-cover { --cover-width:185px; margin:0 auto 24px; }
.sidebar-label, .eyebrow { color: var(--accent); font-size: 11px; letter-spacing: .12em; }.sidebar-title { margin-top: 10px; font-size: 23px; font-weight: 700; line-height: 1.25; }.sidebar-author { color: var(--muted); font-size: 13px; margin-top: 8px; }.sidebar-description { color: var(--muted); font-size: 12px; line-height: 1.65; margin-top: 20px; }.sidebar-stats { display: flex; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-top: 24px; padding: 20px 0; justify-content: space-between; }.sidebar-stats view { display: flex; flex-direction: column; gap: 4px; }.sidebar-stats .stat-number { font-size: 20px; color: var(--text); font-weight: 600; }.sidebar-stats text { font-size: 11px; color: var(--muted); }.sidebar-export { color: var(--accent); font-size: 13px; font-weight: 650; padding-top: 23px; }
.book-content { min-width: 0; }.content-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.content-heading .page-title { margin: 12px 0 7px; }.new-chapter { flex-shrink: 0; background: var(--accent); color: #fff; padding: 12px 16px; border-radius: 13px; font-size: 13px; font-weight: 650; }.search-box { display: flex; align-items: center; gap: 12px; margin: 27px 0 21px; height: 48px; padding: 0 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--muted); font-size: 23px; }.search-box input { flex: 1; font-size: 13px; color: var(--text); }.chapter-card { margin-bottom: 16px; padding: 17px 20px 3px; }.chapter-heading { display: flex; align-items: center; gap: 14px; min-height: 45px; }.chapter-num { width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 10px; color: var(--accent); background: var(--accent-soft); font-size: 11px; }.chapter-name { flex: 1; min-width: 0; font-size: 17px; font-weight: 700; }.chapter-action { color: var(--muted); font-size: 23px; padding: 0 5px; }.article-row { display: flex; align-items: center; min-height: 72px; gap: 13px; border-top: 1px solid var(--line); padding: 10px 0; }.article-icon { width: 30px; height: 30px; border-radius: 9px; background: var(--surface-alt); color: var(--muted); font-size: 16px; line-height: 30px; text-align: center; }.article-main { flex: 1; min-width: 0; }.article-title { font-size: 14px; font-weight: 600; }.article-preview { color: var(--muted); font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-top: 5px; }.article-tail { display: flex; align-items: center; gap: 18px; color: var(--muted); font-size: 11px; }.article-more { font-size: 23px; padding: 5px; }.add-article { border-top: 1px solid var(--line); color: var(--accent); font-size: 13px; padding: 17px 0 19px 43px; }
.book-edit { display: flex; gap: 17px; }.cover-edit { flex: 0 0 104px; height: 146px; border-radius: 8px; background: var(--surface-alt); overflow: hidden; }.cover-edit image { width: 100%; height: 100%; }.cover-edit-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: var(--accent); font-size: 25px; }.cover-edit-placeholder text { font-size: 11px; }.book-fields { flex: 1; min-width: 0; }.description-input { width: 100%; height: 72px; background: var(--surface-alt); color: var(--text); border-radius: 12px; padding: 12px; font-size: 13px; }.export-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; padding: 12px 0; }.export-row text { display: block; color: var(--muted); font-size: 12px; margin-top: 6px; }.custom-check { width: 23px; height: 23px; border: 1px solid var(--line); border-radius: 7px; text-align: center; line-height: 22px; color: #fff; }.custom-check.checked { background: var(--accent); border-color: var(--accent); }
@media (max-width: 700px) { .book-layout { display: block; }.book-sidebar { display: grid; grid-template-columns: 92px 1fr; column-gap: 20px; padding: 18px; margin-bottom: 27px; }.large-cover { --cover-width:92px; grid-row:span 5; margin:0; }.sidebar-label { align-self: end; }.sidebar-title { margin-top: 5px; }.sidebar-description, .sidebar-stats, .sidebar-export { display: none; } }
@media (max-width: 520px) { .content-heading { align-items: start; }.new-chapter { margin-top: 6px; }.content-heading .page-title { font-size: 29px; }.article-tail text:first-child { display: none; } }
.chapter-card { overflow: hidden; transition: box-shadow .2s ease, transform .2s ease; }
.sidebar-exports { display:flex; gap:18px; flex-wrap:wrap; }.sidebar-export { padding-top:20px; }
.read-only-content { max-width:720px; padding:30px 0; }
.read-only-content .page-title { margin:12px 0; }
.read-only-content>.subtle { max-width:520px; line-height:1.8; }
.read-only-card { display:flex; align-items:center; gap:18px; margin-top:32px; padding:25px; }
.read-only-card>view:nth-child(2) { flex:1; min-width:0; }
.read-only-mark { display:flex; align-items:center; justify-content:center; flex:none; width:60px; height:72px; border-radius:11px; background:var(--accent-soft); color:var(--accent); font-size:31px; }
.read-only-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:15px; font-weight:650; }
.read-only-card text { display:block; margin-top:6px; color:var(--muted); font-size:11px; }
.read-only-card .primary-button { flex:none; padding:12px 16px; border-radius:11px; background:var(--accent); color:#fff; font-size:12px; }
.read-only-outline { margin-top:34px; }
.outline-group { margin-top:15px; padding:15px 18px; border:1px solid var(--line); border-radius:15px; background:var(--surface); }
.outline-group-title { font-size:15px; font-weight:650; }
.outline-article { margin:11px 0 0 15px; padding:9px 12px; border-left:1px solid var(--line); color:var(--muted); font-size:13px; transition:background .2s ease,color .2s ease; }
.outline-article:active { color:var(--accent); background:var(--accent-soft); }
@media (max-width:520px) { .read-only-card { flex-wrap:wrap; gap:12px; padding:18px; }.read-only-card .primary-button { width:100%; text-align:center; box-sizing:border-box; } }
@media (max-width:700px) { .book-sidebar .sidebar-exports { grid-column:1 / -1; display:flex; }.book-sidebar .sidebar-export { display:block; padding-top:14px; } }
.chapter-heading { cursor: pointer; }
.chapter-article-count { color: var(--muted); font-size: 11px; font-weight: 450; margin-left: 8px; }
.chapter-caret { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.chapter-caret::after { content: ''; width: 7px; height: 7px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg) translate(-2px, -2px); transition: transform .24s ease; }
.chapter-caret.folded::after { transform: rotate(-45deg); }
.chapter-children { position: relative; margin: 2px 0 0 16px; padding-left: 24px; border-left: 1px solid var(--line); animation: reveal-children .23s ease both; }
.chapter-children::before { content: ''; position: absolute; top: -16px; left: -3px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.article-row { position: relative; }
.article-row::before { content: ''; position: absolute; left: -24px; top: 50%; width: 13px; height: 1px; background: var(--line); }
.article-icon { position: relative; flex: 0 0 25px; width: 25px; height: 28px; border: 1.5px solid var(--accent); border-radius: 4px 7px 5px 5px; background: transparent; transform: rotate(-4deg); }
.article-icon::before { content: ''; position: absolute; right: -1px; top: -1px; width: 8px; height: 8px; border-left: 1.5px solid var(--accent); border-bottom: 1.5px solid var(--accent); border-radius: 0 5px 0 3px; background: var(--surface); }
.article-icon view { position: absolute; left: 5px; right: 5px; height: 1px; border-radius: 1px; background: var(--accent); opacity: .72; }.article-icon view:first-child { top: 13px; }.article-icon view:last-child { top: 18px; right: 8px; }
.article-row:active { transform: translateX(3px); }
.add-article { padding-left: 43px; }
.resume-card { display: flex; align-items: center; gap: 12px; margin: -3px 0 22px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--accent-soft); color: var(--accent); transition: transform .18s ease; }.resume-card:active { transform: scale(.985); }.resume-mark { width: 31px; height: 31px; border-radius: 10px; background: var(--surface); display: flex; align-items: center; justify-content: center; }.resume-line { position: relative; width: 14px; height: 2px; background: currentColor; border-radius: 2px; }.resume-line::after { content: ''; position: absolute; right: 0; top: -4px; width: 8px; height: 8px; border-top: 2px solid currentColor; border-right: 2px solid currentColor; transform: rotate(45deg); }.resume-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }.resume-copy text { font-size: 11px; }.resume-copy strong { color: var(--text); font-size: 14px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.resume-arrow { width: 8px; height: 8px; border-top: 2px solid currentColor; border-right: 2px solid currentColor; transform: rotate(45deg); margin-right: 4px; }
@keyframes reveal-children { from { opacity: .3; transform: translateY(-7px); } }
@media (prefers-reduced-motion: reduce) { .chapter-caret, .chapter-children, .chapter-card { transition: none; animation: none; } }
</style>
