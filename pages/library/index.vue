<template>
  <view class="screen" :class="themeClass()"><view class="page-wrap">
    <view class="topbar"><view class="brand"><text class="brand-mark">纸</text><text>纸间</text></view><view class="top-actions"><text class="top-note">专注于你正在写的故事</text><view class="round-action" @tap="openCreate">＋</view></view></view>
    <view class="hero"><view class="hero-copy"><view class="hero-kicker">你的私人写作空间</view><view class="page-title">故事，始于此刻。</view><view class="subtle">整理章节，沉浸写作，让每本书都有自己的模样。</view><view class="hero-button" @tap="openCreate">＋　新建书籍</view></view><view class="hero-decoration"><view class="arc arc-a"></view><view class="arc arc-b"></view><text>写</text></view></view>
    <view class="section-head"><view><view class="section-title">我的书架 <text class="book-count">{{ books.length }}</text></view><view class="subtle">长按或点击更多可管理书籍</view></view><view class="sort-note">最近编辑</view></view>
    <view v-if="!books.length" class="empty card">书架还没有书。点击“新建书籍”，写下第一章。</view>
    <view class="book-grid"><view v-for="(book, index) in books" :key="book.id" class="book-card card" :class="{ 'new-book': freshId === book.id, removing: removingId === book.id }" @tap="openBook(book.id)" @longpress="openActions(book)"><view class="book-art" :class="'cover-' + index % 4"><image v-if="book.cover" :src="book.cover" mode="aspectFill" class="cover-image" /><view v-else class="cover-letter">{{ book.title.slice(0, 1) }}</view><view class="book-spine"></view></view><view class="book-info"><view class="book-title-row"><view class="book-title">{{ book.title }}</view><view class="more-button" @tap.stop="openActions(book)">···</view></view><view class="book-author">{{ book.author || '未设置作者' }}</view><view class="book-description">{{ book.description || '打开这本书，继续写下去。' }}</view><view class="book-meta"><text>{{ book.chapters.length }} 章 · {{ articleCount(book) }} 篇</text><text>{{ formatDate(book.updatedAt) }}</text></view></view></view></view>
  </view>
  <AppNav active="library" />
  <ActionMenu :visible="!!actionBook && !showDelete" :title="actionBook?.title" :items="[{ label: '编辑书籍信息' }, { label: '删除书籍', danger: true }]" @close="actionBook = null" @select="onAction" />
  <AppDialog :visible="showEdit" :title="editingId ? '编辑书籍' : '新建书籍'" :confirm-text="editingId ? '保存' : '创建书籍'" @cancel="showEdit = false" @confirm="saveBook"><view class="edit-layout"><view class="cover-picker" @tap="chooseCover"><image v-if="draft.cover" :src="draft.cover" mode="aspectFill" /><view v-else class="cover-placeholder">＋<text>选择封面</text></view></view><view class="edit-fields"><input v-model="draft.title" class="field" maxlength="80" placeholder="书名（必填）" /><input v-model="draft.author" class="field" maxlength="80" placeholder="作者（可选）" /><textarea v-model="draft.description" class="description-field" maxlength="240" placeholder="简介（可选）" /></view></view></AppDialog>
  <AppDialog :visible="showDelete" title="删除书籍" :message="`确定删除《${actionBook?.title || ''}》及其中所有章节和正文？此操作无法撤销。`" confirm-text="删除" :destructive="true" @cancel="cancelDelete" @confirm="confirmDelete" />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useLibrary, addBook, updateBook, deleteBook } from '../../src/store/library'
import { primaryNavigation } from '../../src/store/navigation'
import { themeClass } from '../../src/store/preferences'
import { chooseBookCover } from '../../src/services/covers'
import AppNav from '../../components/AppNav.vue'
import ActionMenu from '../../components/ActionMenu.vue'
import AppDialog from '../../components/AppDialog.vue'

const store = useLibrary()
onShow(() => { primaryNavigation.active = 'library' })
const books = computed(() => store.books)
const showEdit = ref(false), showDelete = ref(false), editingId = ref(''), actionBook = ref(null)
const freshId = ref(''), removingId = ref('')
const draft = reactive({ title: '', author: '', description: '', cover: '' })
const articleCount = book => book.chapters.reduce((count, chapter) => count + chapter.articles.length, 0)
const formatDate = date => date ? new Date(date).toLocaleDateString('zh-CN') : '今天'
function openBook(id) { if (!actionBook.value && !removingId.value) uni.navigateTo({ url: `/pages/book/index?id=${id}` }) }
function openCreate() { editingId.value = ''; Object.assign(draft, { title: '', author: '', description: '', cover: '' }); showEdit.value = true }
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
.top-actions { display: flex; align-items: center; gap: 20px; }.top-note { font-size: 12px; color: var(--muted); }.round-action { width: 38px; height: 38px; border-radius: 13px; background: var(--surface); border: 1px solid var(--line); color: var(--accent); text-align: center; line-height: 35px; font-size: 24px; }
.hero { margin-top: 27px; min-height: 242px; padding: 38px 44px; border-radius: 28px; background: #23344d; color: #fff; display: flex; justify-content: space-between; overflow: hidden; position: relative; animation: reveal .45s ease both; }.hero-copy { position: relative; z-index: 1; }.hero-kicker { color: #b9c7da; font-size: 12px; letter-spacing: .08em; }.hero .page-title { color: #fff; margin: 18px 0 10px; }.hero .subtle { color: #c2ccdb; max-width: 470px; }.hero-button { margin-top: 25px; display: inline-block; background: #f1f4f8; color: #2b3a52; padding: 11px 17px; border-radius: 11px; font-size: 13px; font-weight: 650; }.hero-button:active { transform: scale(.97); }
.hero-decoration { width: 250px; position: relative; display: flex; align-items: center; justify-content: center; font-family: serif; font-size: 105px; color: rgba(255,255,255,.45); }.arc { position: absolute; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; }.arc-a { width: 260px; height: 260px; }.arc-b { width: 175px; height: 175px; }
.section-head { display: flex; align-items: end; justify-content: space-between; margin: 30px 0 20px; }.section-title { margin: 0 0 5px; }.book-count { font-size: 13px; color: var(--muted); margin-left: 7px; }.sort-note { color: var(--muted); font-size: 12px; }
.book-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }.book-card { padding: 20px; display: flex; gap: 20px; min-height: 210px; transition: transform .22s ease, box-shadow .22s ease; animation: reveal .38s ease both; }.book-card:active { transform: scale(.985); }.book-art { position: relative; flex: 0 0 113px; height: 166px; border-radius: 5px 13px 13px 5px; display: flex; align-items: center; justify-content: center; overflow: hidden; }.cover-0 { background: #58718e; }.cover-1 { background: #807c9a; }.cover-2 { background: #66887e; }.cover-3 { background: #947d72; }.cover-image { width: 100%; height: 100%; }.cover-letter { font-family: serif; color: rgba(255,255,255,.94); font-size: 58px; }.book-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 7px; background: rgba(0,0,0,.12); }
.book-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }.book-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.book-title { font-size: 20px; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.more-button { flex-shrink: 0; font-size: 22px; color: var(--muted); padding: 0 5px; }.book-author { color: var(--accent); font-size: 12px; margin-top: 7px; }.book-description { color: var(--muted); font-size: 12px; line-height: 1.55; margin-top: 15px; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.book-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: auto; color: var(--muted); font-size: 11px; }
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
</style>
