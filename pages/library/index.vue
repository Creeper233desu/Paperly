<template>
  <view class="home-shell" :class="themeClass()"><view class="home-panel" :class="{ active: tabIndex === 0 }" :style="panelStyle(0)"><view class="screen" :class="themeClass()"><view class="page-wrap">
    <view class="topbar"><view class="brand"><image class="brand-mark" src="/static/brand/app-icon.png" mode="aspectFill" /><text>纸间</text></view><view class="top-actions"><text class="top-note">专注于你正在写的故事</text><view class="import-trigger" :class="{ busy: importBusy }" @tap="!importBusy && (showImportOptions = true)"><UiIcon name="download" /><text>导入书籍</text></view><view class="round-action" aria-label="新建书籍" @tap="openCreate"><UiIcon name="plus" /></view></view></view>
    <view v-if="!books.length" class="hero"><view class="hero-copy"><view class="hero-kicker">简洁优雅的写作空间</view><view class="page-title">叙事始于此刻。</view><view class="subtle">整理章节，沉浸写作，让每本书都有自己的模样。</view><view class="hero-button" @tap="openCreate">＋　新建书籍</view><view class="hero-import" @tap="showImportOptions = true">导入已有文稿</view></view><view class="hero-decoration"><view class="arc arc-a"></view><view class="arc arc-b"></view><text>写</text></view></view>
    <view class="section-head"><view><view class="section-title">我的书架 <text class="book-count">{{ books.length }}</text></view><view class="subtle">长按或点击更多可管理书籍</view></view><view class="sort-note">最近编辑</view></view>
    <view v-if="!books.length" class="empty card">书架还没有书。点击“新建书籍”，写下第一章。</view>
    <view class="book-grid"><view v-for="(book, index) in books" :key="book.id" class="book-card card" :class="{ 'new-book': freshId === book.id, removing: removingId === book.id }" @tap="openBook(book.id)" @longpress="openActions(book)"><view class="book-art" :class="'cover-' + index % 4"><image v-if="book.cover" :src="book.cover" mode="aspectFill" class="cover-image" /><view v-else class="cover-letter">{{ book.title.slice(0, 1) }}</view><view class="book-spine"></view></view><view class="book-info"><view class="book-title-row"><view class="book-title">{{ book.title }}</view><MoreIcon class="more-button" @tap.stop="openActions(book)" /></view><view class="book-author">{{ book.author || '未设置作者' }}</view><view class="book-description">{{ book.description || (book.readOnly ? '旧版导入文件，可转换为可编辑书籍。' : '打开这本书，继续写下去。') }}</view><view class="book-meta"><text>{{ book.readOnly ? `${book.readOnly.format.toUpperCase()} · 只读` : `${book.chapters.length} 章 · ${articleCount(book)} 篇` }}</text><text>{{ formatDate(book.updatedAt) }}</text></view></view></view></view>
  </view></view></view>
  <view class="home-panel" :class="{ active: tabIndex === 1 }" :style="panelStyle(1)"><StatisticsPanel /></view>
  <view class="home-panel" :class="{ active: tabIndex === 2 }" :style="panelStyle(2)"><SettingsPanel :embedded="true" :active="tabIndex === 2" @modal-change="settingsModalOpen = $event" /></view>
  <AppNav />
  <DataDirectoryGate v-if="needsDataDirectory()" />
  <PdfImportBridge ref="pdfBridge" @progress="pdfProgress" />
  <AppSheet :visible="showImportOptions" title="导入文稿" subtitle="把已有文字整理成书，导入后可继续编辑。" @close="showImportOptions = false">
    <view class="import-option" @tap="chooseImport('docx')"><view class="format-badge docx"><UiIcon name="file" /><text>DOCX</text></view><view class="option-copy"><strong>Word 文档</strong><text>识别标题层级，保留正文段落</text></view><UiIcon name="chevron-right" /></view>
    <view class="import-option" @tap="chooseImport('pdf')"><view class="format-badge pdf"><UiIcon name="file" /><text>PDF</text></view><view class="option-copy"><strong>PDF 文档</strong><text>提取文字，整理为可编辑章节</text></view><UiIcon name="chevron-right" /></view>
    <view class="import-help">导入前可修改书名和作者。PDF 需要包含文字层；扫描件请先进行 OCR。</view>
  </AppSheet>
  <AppSheet :visible="importBusy" title="正在导入" :subtitle="importProgress" @close="cancelPendingImport"><view class="import-progress"><view></view></view><view class="import-help">较长的文档需要一点时间，完成后可预览章节。</view></AppSheet>
  <AppDialog :visible="!!importFailure" title="无法导入文稿" :message="importFailure" confirm-text="知道了" @cancel="importFailure = ''" @confirm="importFailure = ''" />
  <ActionMenu :visible="!!actionBook && !showDelete" :title="actionBook?.title" :items="[{ label: '编辑书籍信息' }, { label: '删除书籍', danger: true }]" @close="actionBook = null" @select="onAction" />

  <AppDialog :visible="showEdit" :title="editingId ? '编辑书籍' : '新建书籍'" :confirm-text="editingId ? '保存' : '创建书籍'" @cancel="showEdit = false" @confirm="saveBook"><view class="edit-layout"><view class="cover-picker" @tap="chooseCover"><image v-if="draft.cover" :src="draft.cover" mode="aspectFill" /><view v-else class="cover-placeholder">＋<text>选择封面</text></view></view><view class="edit-fields"><input v-model="draft.title" class="field" maxlength="80" placeholder="书名（必填）" /><input v-model="draft.author" class="field" maxlength="80" placeholder="作者（可选）" /><textarea v-model="draft.description" class="description-field" maxlength="240" placeholder="简介（可选）" /></view></view></AppDialog>
  <AppSheet :visible="showImport" title="确认文稿" subtitle="核对书籍信息和目录，准备好后加入书架。" @close="cancelImport"><view class="import-source">{{ importFileName }}</view><view class="import-field-label">书名</view><input v-model="importDraft.title" class="field" maxlength="80" placeholder="填写书名" /><view class="import-field-label">作者</view><input v-model="importDraft.author" class="field" maxlength="80" placeholder="作者（可选）" /><view class="import-field-label">简介</view><textarea v-model="importDraft.description" class="description-field" maxlength="240" placeholder="简介（可选）" /><view class="import-overview"><text>{{ importSummary.chapters }} 章 · {{ importSummary.articles }} 篇 · {{ importSummary.words }} 字</text><text>识别预览</text></view><scroll-view class="import-outline" scroll-y><view v-for="(group, index) in importPreview?.chapters || []" :key="index" class="import-chapter"><view><text class="import-chapter-number">{{ String(index + 1).padStart(2, '0') }}</text><text>{{ group.title }}</text></view><text class="import-article" v-for="(item, articleIndex) in group.articles" :key="articleIndex">{{ item.title || '无题正文' }} · {{ item.paragraphs.length }} 段</text></view></scroll-view><view class="import-note">{{ importFormat === 'pdf' ? '已按章节标题整理并合并排版断行。PDF 仅提取文字，可在导入后调整段落。' : '标题样式及“第 X 章 / 节”会成为目录；普通段落保留为正文。仅导入文字。' }}</view><view v-for="warning in importPreview?.warnings || []" :key="warning" class="import-warning">{{ warning }}</view><template #footer><view class="import-footer"><view @tap="cancelImport">取消</view><view class="import-save" @tap="saveImportedBook"><UiIcon name="download" /><text>导入书架</text></view></view></template></AppSheet>
  <AppDialog :visible="showDelete" title="删除书籍" :message="`确定删除《${actionBook?.title || ''}》及其中所有章节和正文？此操作无法撤销。`" confirm-text="删除" :destructive="true" @cancel="cancelDelete" @confirm="confirmDelete" />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useLibrary, addBook, importBook, updateBook, deleteBook } from '../../src/store/library'
import { PRIMARY_TABS, primaryNavigation } from '../../src/store/navigation'
import { themeClass } from '../../src/store/preferences'
import { chooseBookCover } from '../../src/services/covers'
import AppNav from '../../components/AppNav.vue'
import DataDirectoryGate from '../../components/DataDirectoryGate.vue'
import { needsDataDirectory } from '../../src/services/data-directory.js'
import ActionMenu from '../../components/ActionMenu.vue'
import AppDialog from '../../components/AppDialog.vue'
import StatisticsPanel from '../../components/StatisticsPanel.vue'
import SettingsPanel from '../settings/index.vue'
import MoreIcon from '../../components/MoreIcon.vue'
import { pickAndroidDocx } from '../../src/services/android-docx-picker'
import { importedBookSummary, parseDocx } from '../../src/services/docx-import'
import { pickAndroidPdf, removeImportedFile } from '../../src/services/android-pdf-picker'
import { buildPdfBook } from '../../src/services/pdf-import'
import PdfImportBridge from '../../components/PdfImportBridge.vue'
import AppSheet from '../../components/AppSheet.vue'
import UiIcon from '../../components/UiIcon.vue'

const store = useLibrary()
onLoad(options => { if (PRIMARY_TABS.includes(options?.tab)) primaryNavigation.active = options.tab })
const tabIndex = computed(() => Math.max(0, PRIMARY_TABS.indexOf(primaryNavigation.active)))
const settingsModalOpen = ref(false)
const panelStyle = index => ({ '--panel-shift': `${(index - tabIndex.value) * 100}%`, zIndex: index === 2 && settingsModalOpen.value ? 20 : index === tabIndex.value ? 2 : 1, pointerEvents: index === tabIndex.value ? 'auto' : 'none' })
const books = computed(() => store.books)
const showEdit = ref(false), showDelete = ref(false), editingId = ref(''), actionBook = ref(null)
const showImport = ref(false), showImportOptions = ref(false), importBusy = ref(false), importPreview = ref(null), importFileName = ref('')
const importDraft = reactive({ title: '', author: '', description: '' })
const importFailure = ref('')
const pdfBridge = ref(null), importProgress = ref(''), importFormat = ref('docx')
const importSummary = computed(() => importPreview.value ? importedBookSummary(importPreview.value) : { chapters: 0, articles: 0, words: 0 })
let importGeneration = 0
const freshId = ref(''), removingId = ref('')
const draft = reactive({ title: '', author: '', description: '', cover: '' })
const articleCount = book => book.chapters.reduce((count, chapter) => count + chapter.articles.length, 0)
const formatDate = date => date ? new Date(date).toLocaleDateString('zh-CN') : '今天'
function openBook(id) { if (!actionBook.value && !removingId.value) uni.navigateTo({ url: `/pages/book/index?id=${id}` }) }
function openCreate() { editingId.value = ''; Object.assign(draft, { title: '', author: '', description: '', cover: '' }); showEdit.value = true }
function chooseImport(format) { if (importBusy.value) return; showImportOptions.value = false; openImport(format) }
function cancelImport() { importGeneration++; pdfBridge.value?.cancel(); showImport.value = false }
function cancelPendingImport() { importGeneration++; pdfBridge.value?.cancel() }
function pdfProgress(progress) { importProgress.value = `正在提取第 ${progress.current} / ${progress.total} 页` }
async function openImport(format = 'docx') {
  if (importBusy.value) return
  importBusy.value = true
  importFormat.value = format
  const generation = ++importGeneration
  importProgress.value = '正在选择文件'
  let file
  try {
    file = format === 'pdf' ? await pickAndroidPdf() : await pickAndroidDocx()
    if (generation !== importGeneration) return
    importProgress.value = '正在识别正文'
    let parsed
    if (format === 'pdf') {
      const result = await pdfBridge.value.parse(file)
      parsed = buildPdfBook(result.pages, result.metadata, file.name)
    } else parsed = parseDocx(file.bytes, file.name)
    if (generation !== importGeneration) return
    importPreview.value = parsed
    importFileName.value = file.name
    Object.assign(importDraft, { title: parsed.title, author: parsed.author, description: parsed.description })
    showImport.value = true
  } catch (error) {
    if (!String(error.message).includes('取消')) importFailure.value = error.message || '导入失败'
  } finally { if (format === 'pdf') removeImportedFile(file?.path); importBusy.value = false; importProgress.value = '' }
}
function saveImportedBook() {
  if (!importPreview.value) return
  try {
    const book = importBook(importPreview.value, importDraft)
    showImport.value = false
    importPreview.value = null
    freshId.value = book.id
    setTimeout(() => { if (freshId.value === book.id) freshId.value = '' }, 900)
  } catch (error) { uni.showToast({ title: error.message, icon: 'none' }) }
}
function openActions(book) { actionBook.value = book }
function onAction(index) {
  if (index === 0) { editingId.value = actionBook.value.id; Object.assign(draft, { title: actionBook.value.title, author: actionBook.value.author || '', description: actionBook.value.description || '', cover: actionBook.value.cover || '' }); actionBook.value = null; showEdit.value = true }
  else showDelete.value = true
}
async function chooseCover() { try { draft.cover = await chooseBookCover() } catch (error) { if (!String(error.message).includes('取消')) uni.showToast({ title: error.message, icon: 'none' }) } }
function saveBook() {
  if (!draft.title.trim()) return uni.showToast({ title: '请填写书名', icon: 'none' })
  if (editingId.value) updateBook(editingId.value, draft)
  else { const book = addBook(draft.title); updateBook(book.id, draft); freshId.value = book.id; setTimeout(() => { if (freshId.value === book.id) freshId.value = '' }, 900) }
  showEdit.value = false
}
function confirmDelete() {
  const id = actionBook.value?.id
  showDelete.value = false; actionBook.value = null
  if (!id) return
  removingId.value = id
  setTimeout(() => { deleteBook(id); removingId.value = '' }, 280)
}
function cancelDelete() { showDelete.value = false; actionBook.value = null }
</script>

<style scoped>
.brand { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 750; letter-spacing: .06em; }.brand-mark { width: 31px; height: 31px; border-radius: 9px; background: var(--accent); color: #fff; text-align: center; line-height: 31px; font-size: 17px; }
.brand-mark { background:transparent; object-fit:contain; }
.top-actions { display: flex; align-items: center; gap: 20px; }.top-note { font-size: 12px; color: var(--muted); }.round-action { width: 38px; height: 38px; border-radius: 13px; background: var(--surface); border: 1px solid var(--line); color: var(--accent); text-align: center; line-height: 35px; font-size: 24px; }
.hero { margin-top: 27px; min-height: 242px; padding: 38px 44px; border-radius: 28px; background: #23344d; color: #fff; display: flex; justify-content: space-between; overflow: hidden; position: relative; animation: reveal .45s ease both; }.hero-copy { position: relative; z-index: 1; }.hero-kicker { color: #b9c7da; font-size: 12px; letter-spacing: .08em; }.hero .page-title { color: #fff; margin: 18px 0 10px; }.hero .subtle { color: #c2ccdb; max-width: 470px; }.hero-button { margin-top: 25px; display: inline-block; background: #f1f4f8; color: #2b3a52; padding: 11px 17px; border-radius: 11px; font-size: 13px; font-weight: 650; }.hero-button:active { transform: scale(.97); }
.hero-decoration { width: 250px; position: relative; display: flex; align-items: center; justify-content: center; font-family: serif; font-size: 105px; color: rgba(255,255,255,.45); }.arc { position: absolute; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; }.arc-a { width: 260px; height: 260px; }.arc-b { width: 175px; height: 175px; }
.section-head { display: flex; align-items: end; justify-content: space-between; margin: 30px 0 20px; }.section-title { margin: 0 0 5px; }.book-count { font-size: 13px; color: var(--muted); margin-left: 7px; }.sort-note { color: var(--muted); font-size: 12px; }
.book-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }.book-card { min-width:0; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden; padding: 20px; display: flex; gap: 20px; min-height: 210px; transition: transform .22s ease, box-shadow .22s ease; animation: reveal .38s ease both; }.book-card:active { transform: scale(.985); }.book-art { position: relative; flex: 0 0 113px; height: 166px; border-radius: 5px 13px 13px 5px; display: flex; align-items: center; justify-content: center; overflow: hidden; }.cover-0 { background: #58718e; }.cover-1 { background: #807c9a; }.cover-2 { background: #66887e; }.cover-3 { background: #947d72; }.cover-image { width: 100%; height: 100%; }.cover-letter { font-family: serif; color: rgba(255,255,255,.94); font-size: 58px; }.book-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 7px; background: rgba(0,0,0,.12); }
.book-info { flex: 1; min-width: 0; overflow:hidden; display: flex; flex-direction: column; }.book-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; min-width:0; width:100%; }.book-title { flex:1; min-width:0; font-size: 20px; line-height:1.3; font-weight: 700; overflow: hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; white-space:normal; word-break:break-all; overflow-wrap:anywhere; }.more-button { flex-shrink: 0; }.book-author { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color: var(--accent); font-size: 12px; margin-top: 7px; }.book-description { min-width:0; word-break:break-all; overflow-wrap:anywhere; color: var(--muted); font-size: 12px; line-height: 1.55; margin-top: 15px; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.book-meta { min-width:0; display: flex; justify-content: space-between; gap: 8px; margin-top: auto; color: var(--muted); font-size: 11px; }.book-meta text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.edit-layout { display: flex; gap: 18px; margin-top: 16px; }.cover-picker { flex: 0 0 104px; height: 145px; border-radius: 8px; background: var(--surface-alt); overflow: hidden; }.cover-picker image { width: 100%; height: 100%; }.cover-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--accent); font-size: 28px; }.cover-placeholder text { font-size: 11px; margin-top: 7px; }.edit-fields { flex: 1; min-width: 0; }.description-field { width: 100%; height: 78px; padding: 12px 14px; border-radius: 12px; background: var(--surface-alt); color: var(--text); font-size: 13px; }
@keyframes reveal { from { opacity: 0; transform: translateY(10px); } }
@media (max-width: 620px) { .book-grid { grid-template-columns: 1fr; }.hero { padding: 30px; }.hero-decoration { display: none; } }
@media (max-width: 440px) { .top-note { display: none; }.book-card { padding: 15px; gap: 15px; min-height: 180px; }.book-art { flex-basis: 95px; height: 147px; }.book-title { font-size: 18px; }.hero { min-height: 220px; } }
@media (prefers-reduced-motion: reduce) { .hero, .book-card { animation: none; transition: none; } }
.book-card.new-book { animation: book-arrive .65s cubic-bezier(.2,.8,.2,1) both; }
.book-card.removing { pointer-events: none; animation: book-leave .28s ease-in both; }
.hero-button, .round-action, .cover-picker { transition: transform .22s ease, box-shadow .22s ease; }
.hero-button:active, .round-action:active, .cover-picker:active { transform: scale(.94); }
@keyframes book-arrive { 0% { opacity: 0; transform: translateY(22px) scale(.9); box-shadow: 0 0 0 0 var(--accent-soft); } 58% { opacity: 1; transform: translateY(-3px) scale(1.018); box-shadow: 0 0 0 12px var(--accent-soft); } 100% { transform: none; } }
@keyframes book-leave { to { opacity: 0; transform: translateY(-14px) scale(.93); filter: blur(3px); } }
@media (prefers-reduced-motion: reduce) { .book-card.new-book, .book-card.removing { animation: none; }.hero-button, .round-action, .cover-picker { transition: none; } }
.import-trigger { min-height:38px; display:flex; align-items:center; gap:8px; padding:0 12px; border:1px solid var(--line); border-radius:12px; background:var(--surface); color:var(--accent); font-size:12px; font-weight:650; transition:transform .22s ease,background .22s ease,box-shadow .22s ease; }
.import-trigger:active { transform:scale(.96); box-shadow:0 4px 14px var(--shadow); }
.import-trigger.busy { opacity:.55; pointer-events:none; }
.import-glyph { position:relative; width:15px; height:16px; border:1.6px solid currentColor; border-radius:2px; }
.import-glyph:before { content:''; position:absolute; top:-2px; right:-2px; width:5px; height:5px; border-left:1.6px solid currentColor; border-bottom:1.6px solid currentColor; background:var(--surface); }
.import-glyph>view { position:absolute; left:6px; bottom:2px; width:1.6px; height:7px; background:currentColor; }
.import-glyph>view:after { content:''; position:absolute; left:-2px; bottom:-1px; width:5px; height:5px; border-bottom:1.6px solid currentColor; border-right:1.6px solid currentColor; transform:rotate(45deg); }
.hero-import { display:inline-block; margin-left:16px; color:#d3deec; font-size:12px; border-bottom:1px solid rgba(211,222,236,.65); padding:7px 0 4px; transition:opacity .2s ease,transform .2s ease; }
.hero-import:active { opacity:.65; transform:translateX(3px); }
.import-dialog :deep(.dialog-box) { max-width:590px; }
.import-source { color:var(--muted); font-size:12px; margin-bottom:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.import-field-label { margin:11px 0 5px; color:var(--muted); font-size:11px; font-weight:600; }
.import-dialog .description-field { height:58px; box-sizing:border-box; }
.import-overview { display:flex; align-items:center; justify-content:space-between; margin:17px 0 8px; font-size:12px; font-weight:650; }
.import-overview text:last-child { color:var(--muted); font-size:10px; font-weight:400; }
.import-outline { height:min(205px,25vh); border:1px solid var(--line); border-radius:12px; background:var(--surface-alt); }
.import-chapter { padding:10px 12px; border-bottom:1px solid var(--line); font-size:12px; }
.import-chapter>view { display:flex; gap:9px; align-items:center; font-weight:650; }
.import-chapter-number { color:var(--accent); font-size:10px; }
.import-article { display:block; margin:7px 0 0 22px; color:var(--muted); font-size:11px; }
.import-note { margin-top:10px; color:var(--muted); font-size:10px; line-height:1.5; }
@media(max-width:440px) { .import-trigger { width:38px; padding:0; justify-content:center; }.import-trigger>text { display:none; }.hero-import { margin-left:0; display:block; width:max-content; } }
@media(prefers-reduced-motion:reduce) { .import-trigger,.hero-import { transition:none; } }
.round-action { display:flex; align-items:center; justify-content:center; transition:transform .2s ease; }.round-action:active { transform:scale(.9); }
.import-option { display:flex; align-items:center; gap:16px; padding:18px 0; border-bottom:1px solid var(--line); color:var(--muted); transition:transform .2s ease; }.import-option:active { transform:translateX(4px); }.format-badge { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; width:56px; height:64px; border-radius:13px; background:var(--accent-soft); color:var(--accent); flex:none; }.format-badge text { font-size:9px; font-weight:750; }.format-badge.pdf { color:var(--danger); background:var(--surface-alt); }.option-copy { flex:1; min-width:0; }.option-copy strong { display:block; color:var(--text); font-size:16px; font-weight:650; }.option-copy text,.import-help { display:block; font-size:12px; line-height:1.8; color:var(--muted); margin-top:5px; }.import-help { margin-top:20px; }.import-warning { margin-top:8px; color:var(--danger); font-size:12px; line-height:1.6; }.import-progress { height:4px; overflow:hidden; border-radius:4px; background:var(--surface-alt); }.import-progress view { width:35%; height:100%; border-radius:4px; background:var(--accent); animation:import-progress 1.2s ease-in-out infinite alternate; }@keyframes import-progress { to { transform:translateX(185%); } }
@media(prefers-reduced-motion:reduce) { .import-option,.round-action { transition:none; }.import-progress view { animation:none; width:100%; opacity:.5; } }
.import-footer { display:flex; align-items:center; justify-content:flex-end; gap:20px; font-size:13px; color:var(--muted); }.import-save { display:flex; align-items:center; gap:7px; border-radius:12px; padding:10px 17px; background:var(--accent); color:var(--surface); font-weight:600; transition:transform .18s ease; }.import-save:active { transform:scale(.97); }
</style>
