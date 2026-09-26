<template>
  <view class="screen" :class="themeClass()"><view class="page-wrap">
    <view class="topbar"><text class="back" @tap="back">‹　返回书架</text><text class="top-action" @tap="openBookMenu">更多操作　···</text></view>
    <view v-if="book" class="book-layout"><view class="book-sidebar"><view class="large-cover"><image v-if="book.cover" :src="book.cover" mode="aspectFill" /><view v-else class="large-letter">{{ book.title.slice(0, 1) }}</view><view class="large-spine"></view></view><view class="sidebar-label">当前书籍</view><view class="sidebar-title">{{ book.title }}</view><view class="sidebar-author">{{ book.author || '未设置作者' }}</view><view v-if="book.description" class="sidebar-description">{{ book.description }}</view><view class="sidebar-stats"><view><text class="stat-number">{{ book.chapters.length }}</text><text>章节</text></view><view><text class="stat-number">{{ totalArticles }}</text><text>正文</text></view><view><text class="stat-number">{{ totalWords }}</text><text>字数</text></view></view><view class="sidebar-export" @tap="showExport = true">导出 PDF　↗</view></view>
      <view class="book-content"><view class="content-heading"><view><view class="eyebrow">写作目录</view><view class="page-title">章节与正文</view><view class="subtle">继续写下一个片段，或从已有的正文开始。</view></view><view class="new-chapter" @tap="openCreateChapter">＋ 新建章节</view></view><view class="search-box"><text>⌕</text><input v-model="query" placeholder="搜索章节、篇名或正文" confirm-type="search" /></view>
      <view v-if="!book.chapters.length" class="empty card">先创建一个章节，再写第一篇正文。</view><view v-for="(chapter, ci) in visibleChapters" :key="chapter.id" class="chapter-card card"><view class="chapter-heading"><view class="chapter-num">{{ String(ci + 1).padStart(2, '0') }}</view><view class="chapter-name">{{ chapter.title }}</view><view class="chapter-action" @tap="openChapterMenu(chapter)">···</view></view><view v-for="article in filteredArticles(chapter)" :key="article.id" class="article-row" @tap="openArticle(chapter.id, article.id)" @longpress="openArticleMenu(chapter, article)"><view class="article-icon">✎</view><view class="article-main"><view class="article-title">{{ article.title || '无题正文' }}</view><view class="article-preview">{{ preview(article) }}</view></view><view class="article-tail"><text>{{ wordCount(article) }} 字</text><text class="article-more" @tap.stop="openArticleMenu(chapter, article)">···</text></view></view><view class="add-article" @tap="startArticle(chapter.id)">＋ 添加正文</view></view><view v-if="query && !visibleChapters.length" class="empty">没有找到匹配内容</view></view>
    </view>
  </view><AppNav active="" />
  <ActionMenu :visible="!!menuType && !dialogType" :title="menuTitle" :items="menuItems" @close="menuType = ''" @select="onMenuSelect" />
  <AppDialog :visible="dialogType === 'chapter'" :title="chapterDraftId ? '重命名章节' : '新建章节'" :confirm-text="chapterDraftId ? '保存' : '创建章节'" @cancel="dialogType = ''" @confirm="saveChapter"><input v-model="chapterDraftTitle" class="field" maxlength="80" placeholder="章节名（必填）" /></AppDialog>
  <AppDialog :visible="dialogType === 'book'" title="编辑书籍信息" confirm-text="保存" @cancel="dialogType = ''" @confirm="saveBookInfo"><view class="book-edit"><view class="cover-edit" @tap="selectCover"><image v-if="bookDraft.cover" :src="bookDraft.cover" mode="aspectFill" /><view v-else class="cover-edit-placeholder">＋<text>选择封面</text></view></view><view class="book-fields"><input v-model="bookDraft.title" class="field" maxlength="80" placeholder="书名" /><input v-model="bookDraft.author" class="field" maxlength="80" placeholder="作者" /><textarea v-model="bookDraft.description" class="description-input" maxlength="240" placeholder="简介" /></view></view></AppDialog>
  <AppDialog :visible="dialogType === 'deleteChapter'" title="删除章节" :message="`确定删除「${selectedChapter?.title || ''}」和其中全部正文？`" confirm-text="删除章节" :destructive="true" @cancel="dialogType = ''" @confirm="confirmDeleteChapter" />
  <AppDialog :visible="dialogType === 'deleteArticle'" title="删除正文" :message="`确定删除「${selectedArticle?.title || '无题正文'}」？`" confirm-text="删除正文" :destructive="true" @cancel="dialogType = ''" @confirm="confirmDeleteArticle" />
  <AppDialog :visible="showExport" title="导出整本书" confirm-text="生成 PDF" @cancel="showExport = false" @confirm="doExport"><view class="export-row" @tap="withToc = !withToc"><view><view>包含目录</view><text>按章节生成导航页</text></view><view class="custom-check" :class="{ checked: withToc }">{{ withToc ? '✓' : '' }}</view></view></AppDialog>
  <AppDialog :visible="!!exportResult" :title="exportResult?.ok ? 'PDF 已生成' : '导出失败'" :message="exportResult?.message" :confirm-text="exportResult?.ok ? '打开 PDF' : '知道了'" @cancel="exportResult = null" @confirm="openExport" />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getBook, updateBook, addChapter, renameChapter, deleteChapter, addArticle, deleteArticle, wordCount } from '../../src/store/library'
import { themeClass } from '../../src/store/preferences'
import { chooseBookCover } from '../../src/services/covers'
import { exportBookPdf } from '../../src/services/pdf'
import AppNav from '../../components/AppNav.vue'
import ActionMenu from '../../components/ActionMenu.vue'
import AppDialog from '../../components/AppDialog.vue'

const bookId = ref(''), query = ref(''), menuType = ref(''), dialogType = ref(''), showExport = ref(false), withToc = ref(true), exportResult = ref(null)
const selectedChapter = ref(null), selectedArticle = ref(null), chapterDraftId = ref(''), chapterDraftTitle = ref('')
const bookDraft = reactive({ title: '', author: '', description: '', cover: '' })
onLoad(options => { bookId.value = options.id || '' })
const book = computed(() => getBook(bookId.value))
const totalArticles = computed(() => book.value?.chapters.reduce((n, c) => n + c.articles.length, 0) || 0)
const totalWords = computed(() => book.value?.chapters.reduce((n, c) => n + c.articles.reduce((a, item) => a + wordCount(item), 0), 0) || 0)
const articleMatches = a => (a.title + '\n' + a.paragraphs.join('\n')).toLocaleLowerCase().includes(query.value.toLocaleLowerCase())
const visibleChapters = computed(() => book.value?.chapters.filter(ch => !query.value || ch.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()) || ch.articles.some(articleMatches)) || [])
const filteredArticles = ch => !query.value || ch.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()) ? ch.articles : ch.articles.filter(articleMatches)
const preview = a => a.paragraphs.find(p => p.trim()) || '还没有正文'
const menuTitle = computed(() => menuType.value === 'book' ? book.value?.title : menuType.value === 'chapter' ? selectedChapter.value?.title : selectedArticle.value?.title || '无题正文')
const menuItems = computed(() => menuType.value === 'book' ? [{ label: '编辑书籍信息' }, { label: '导出 PDF' }] : menuType.value === 'chapter' ? [{ label: '重命名章节' }, { label: '删除章节', danger: true }] : [{ label: '删除正文', danger: true }])
function back() { uni.navigateBack() }
function openBookMenu() { if (book.value) menuType.value = 'book' }
function openChapterMenu(chapter) { selectedChapter.value = chapter; menuType.value = 'chapter' }
function openArticleMenu(chapter, article) { selectedChapter.value = chapter; selectedArticle.value = article; menuType.value = 'article' }
function onMenuSelect(index) {
  const type = menuType.value; menuType.value = ''
  if (type === 'book' && index === 0) { Object.assign(bookDraft, { title: book.value.title, author: book.value.author || '', description: book.value.description || '', cover: book.value.cover || '' }); dialogType.value = 'book' }
  if (type === 'book' && index === 1) showExport.value = true
  if (type === 'chapter' && index === 0) { chapterDraftId.value = selectedChapter.value.id; chapterDraftTitle.value = selectedChapter.value.title; dialogType.value = 'chapter' }
  if (type === 'chapter' && index === 1) dialogType.value = 'deleteChapter'
  if (type === 'article') dialogType.value = 'deleteArticle'
}
function openCreateChapter() { chapterDraftId.value = ''; chapterDraftTitle.value = ''; dialogType.value = 'chapter' }
function saveChapter() { if (!chapterDraftTitle.value.trim()) return uni.showToast({ title: '请输入章节名', icon: 'none' }); if (chapterDraftId.value) renameChapter(bookId.value, chapterDraftId.value, chapterDraftTitle.value); else addChapter(bookId.value, chapterDraftTitle.value); dialogType.value = '' }
async function selectCover() { try { bookDraft.cover = await chooseBookCover() } catch (error) { if (!String(error.message).includes('取消')) uni.showToast({ title: error.message, icon: 'none' }) } }
function saveBookInfo() { if (!bookDraft.title.trim()) return uni.showToast({ title: '请输入书名', icon: 'none' }); updateBook(bookId.value, bookDraft); dialogType.value = '' }
function confirmDeleteChapter() { deleteChapter(bookId.value, selectedChapter.value.id); dialogType.value = '' }
function confirmDeleteArticle() { deleteArticle(bookId.value, selectedChapter.value.id, selectedArticle.value.id); dialogType.value = '' }
function startArticle(chapterId) { const a = addArticle(bookId.value, chapterId); openArticle(chapterId, a.id) }
function openArticle(chapterId, articleId) { if (!menuType.value) uni.navigateTo({ url: `/pages/editor/index?bookId=${bookId.value}&chapterId=${chapterId}&articleId=${articleId}` }) }
function doExport() {
  showExport.value = false
  try { const path = exportBookPdf(book.value, withToc.value); exportResult.value = { ok: true, path, message: `文件已保存在 ${path}` } }
  catch (error) { exportResult.value = { ok: false, message: error.message || String(error) } }
}
function openExport() {
  const result = exportResult.value; exportResult.value = null
  if (result?.ok) uni.openDocument({ filePath: result.path, fileType: 'pdf', fail: error => { exportResult.value = { ok: false, message: error?.errMsg || '无法打开 PDF 文件' } } })
}
</script>

<style scoped>
.book-layout { display: grid; grid-template-columns: 290px minmax(0,1fr); gap: 48px; margin-top: 25px; }.book-sidebar { padding: 24px; border-radius: 26px; background: var(--surface); border: 1px solid var(--line); height: fit-content; }.large-cover { position: relative; width: 185px; height: 264px; margin: 0 auto 24px; border-radius: 7px 16px 16px 7px; background: #536887; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 10px 15px 28px var(--shadow); }.large-cover image { width: 100%; height: 100%; }.large-letter { font-family: serif; font-size: 86px; color: #fff; }.large-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 9px; background: rgba(0,0,0,.13); }
.sidebar-label, .eyebrow { color: var(--accent); font-size: 11px; letter-spacing: .12em; }.sidebar-title { margin-top: 10px; font-size: 23px; font-weight: 700; line-height: 1.25; }.sidebar-author { color: var(--muted); font-size: 13px; margin-top: 8px; }.sidebar-description { color: var(--muted); font-size: 12px; line-height: 1.65; margin-top: 20px; }.sidebar-stats { display: flex; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-top: 24px; padding: 20px 0; justify-content: space-between; }.sidebar-stats view { display: flex; flex-direction: column; gap: 4px; }.sidebar-stats .stat-number { font-size: 20px; color: var(--text); font-weight: 600; }.sidebar-stats text { font-size: 11px; color: var(--muted); }.sidebar-export { color: var(--accent); font-size: 13px; font-weight: 650; padding-top: 23px; }
.book-content { min-width: 0; }.content-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.content-heading .page-title { margin: 12px 0 7px; }.new-chapter { flex-shrink: 0; background: var(--accent); color: #fff; padding: 12px 16px; border-radius: 13px; font-size: 13px; font-weight: 650; }.search-box { display: flex; align-items: center; gap: 12px; margin: 27px 0 21px; height: 48px; padding: 0 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--muted); font-size: 23px; }.search-box input { flex: 1; font-size: 13px; color: var(--text); }.chapter-card { margin-bottom: 16px; padding: 17px 20px 3px; }.chapter-heading { display: flex; align-items: center; gap: 14px; min-height: 45px; }.chapter-num { width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 10px; color: var(--accent); background: var(--accent-soft); font-size: 11px; }.chapter-name { flex: 1; min-width: 0; font-size: 17px; font-weight: 700; }.chapter-action { color: var(--muted); font-size: 23px; padding: 0 5px; }.article-row { display: flex; align-items: center; min-height: 72px; gap: 13px; border-top: 1px solid var(--line); padding: 10px 0; }.article-icon { width: 30px; height: 30px; border-radius: 9px; background: var(--surface-alt); color: var(--muted); font-size: 16px; line-height: 30px; text-align: center; }.article-main { flex: 1; min-width: 0; }.article-title { font-size: 14px; font-weight: 600; }.article-preview { color: var(--muted); font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-top: 5px; }.article-tail { display: flex; align-items: center; gap: 18px; color: var(--muted); font-size: 11px; }.article-more { font-size: 23px; padding: 5px; }.add-article { border-top: 1px solid var(--line); color: var(--accent); font-size: 13px; padding: 17px 0 19px 43px; }
.book-edit { display: flex; gap: 17px; }.cover-edit { flex: 0 0 104px; height: 146px; border-radius: 8px; background: var(--surface-alt); overflow: hidden; }.cover-edit image { width: 100%; height: 100%; }.cover-edit-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: var(--accent); font-size: 25px; }.cover-edit-placeholder text { font-size: 11px; }.book-fields { flex: 1; min-width: 0; }.description-input { width: 100%; height: 72px; background: var(--surface-alt); color: var(--text); border-radius: 12px; padding: 12px; font-size: 13px; }.export-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; padding: 12px 0; }.export-row text { display: block; color: var(--muted); font-size: 12px; margin-top: 6px; }.custom-check { width: 23px; height: 23px; border: 1px solid var(--line); border-radius: 7px; text-align: center; line-height: 22px; color: #fff; }.custom-check.checked { background: var(--accent); border-color: var(--accent); }
@media (max-width: 700px) { .book-layout { display: block; }.book-sidebar { display: grid; grid-template-columns: 92px 1fr; column-gap: 20px; padding: 18px; margin-bottom: 27px; }.large-cover { grid-row: span 5; width: 92px; height: 132px; margin: 0; }.large-letter { font-size: 47px; }.sidebar-label { align-self: end; }.sidebar-title { margin-top: 5px; }.sidebar-description, .sidebar-stats, .sidebar-export { display: none; } }
@media (max-width: 520px) { .content-heading { align-items: start; }.new-chapter { margin-top: 6px; }.content-heading .page-title { font-size: 29px; }.article-tail text:first-child { display: none; } }
</style>
