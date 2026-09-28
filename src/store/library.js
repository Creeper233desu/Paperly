import { reactive } from 'vue'
import { recordWordDelta } from './statistics.js'

const KEY = 'paperwriter.library.v1'
const state = reactive({ books: [] })
let initialized = false

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
const now = () => new Date().toISOString()

export function initStore() {
  if (initialized) return
  initialized = true
  try {
    const raw = uni.getStorageSync(KEY)
    const saved = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw
    if (saved && Array.isArray(saved.books)) state.books = saved.books
  } catch (error) { console.warn('读取书库失败', error) }
}

function persist() {
  uni.setStorageSync(KEY, JSON.stringify({ version: 1, books: state.books }))
}

export function useLibrary() { initStore(); return state }
export function getBook(id) { initStore(); return state.books.find(book => book.id === id) }
export function getChapter(bookId, chapterId) { return getBook(bookId)?.chapters.find(ch => ch.id === chapterId) }
export function getArticle(bookId, chapterId, articleId) { return getChapter(bookId, chapterId)?.articles.find(article => article.id === articleId) }

export function addBook(title) {
  initStore()
  const book = { id: uid(), title: title.trim(), author: '', description: '', cover: '', createdAt: now(), updatedAt: now(), chapters: [] }
  state.books.unshift(book); persist(); return book
}
export function importBook(content, details = {}) {
  initStore()
  const title = String(details.title || content?.title || '').trim()
  if (!title) throw new Error('请填写书名')
  if (!Array.isArray(content?.chapters) || !content.chapters.length) throw new Error('文档中没有可导入的章节')
  const timestamp = now()
  const chapters = content.chapters.map(group => ({
    id: uid(), title: String(group.title || '正文').trim(),
    articles: (group.articles || []).map(item => ({ id: uid(), title: String(item.title || '').trim(), paragraphs: (item.paragraphs || []).map(String), updatedAt: timestamp }))
  }))
  const first = chapters.flatMap(group => group.articles.map(item => ({ chapterId: group.id, articleId: item.id })))[0]
  const book = { id: uid(), title, author: String(details.author ?? content.author ?? '').trim(), description: String(details.description ?? content.description ?? '').trim(), cover: '', createdAt: timestamp, updatedAt: timestamp, chapters, ...(first ? { lastEdited: { ...first, cursor: 0, updatedAt: timestamp } } : {}) }
  state.books.unshift(book)
  try { persist() }
  catch (error) { state.books.shift(); throw new Error(`保存导入书籍失败：${error.message || '请检查存储空间'}`) }
  return book
}
export function updateBook(id, patch) {
  const book = getBook(id); if (!book) return
  for (const key of ['title', 'author', 'description', 'cover']) {
    if (typeof patch[key] === 'string') book[key] = key === 'title' ? patch[key].trim() : patch[key]
  }
  book.updatedAt = now(); persist()
}
export function renameBook(id, title) { updateBook(id, { title }) }
export function deleteBook(id) {
  const book = getBook(id)
  if (!book) return
  const removed = book.chapters.flatMap(chapter => chapter.articles.map(article => ({ id: article.id, title: article.title, words: wordCount(article) })))
  state.books = state.books.filter(item => item.id !== id); persist()
  removed.forEach(article => recordWordDelta(book.id, book.title, article.id, article.title, -article.words))
}
export function addChapter(bookId, title) {
  const book = getBook(bookId); if (!book) return null
  const chapter = { id: uid(), title: title.trim(), articles: [] }
  book.chapters.push(chapter); book.updatedAt = now(); persist(); return chapter
}
export function renameChapter(bookId, id, title) { const ch = getChapter(bookId, id); if (ch) { ch.title = title.trim(); persist() } }
export function deleteChapter(bookId, id) {
  const book = getBook(bookId), chapter = getChapter(bookId, id)
  if (!book || !chapter) return
  const removed = chapter.articles.map(article => ({ id: article.id, title: article.title, words: wordCount(article) }))
  book.chapters = book.chapters.filter(item => item.id !== id)
  if (book.lastEdited?.chapterId === id) book.lastEdited = null
  persist()
  removed.forEach(article => recordWordDelta(book.id, book.title, article.id, article.title, -article.words))
}
export function addArticle(bookId, chapterId, title = '') {
  const chapter = getChapter(bookId, chapterId); if (!chapter) return null
  const article = { id: uid(), title: title.trim(), paragraphs: [''], updatedAt: now() }
  chapter.articles.push(article)
  const book = getBook(bookId)
  if (book) book.lastEdited = { chapterId, articleId: article.id, cursor: 0, updatedAt: article.updatedAt }
  persist(); return article
}
export function saveArticle(bookId, chapterId, articleId, patch) {
  const article = getArticle(bookId, chapterId, articleId); if (!article) return
  const previousWords = wordCount(article)
  if (typeof patch.title === 'string') article.title = patch.title
  if (Array.isArray(patch.paragraphs)) article.paragraphs = patch.paragraphs.map(String)
  article.updatedAt = now(); const book = getBook(bookId); if (book) book.updatedAt = article.updatedAt
  if (book) {
    book.lastEdited = { chapterId, articleId, cursor: Math.max(0, Number(patch.cursor) || 0), updatedAt: article.updatedAt }
  }
  persist()
  if (book) recordWordDelta(book.id, book.title, article.id, article.title, wordCount(article) - previousWords)
}
export function deleteArticle(bookId, chapterId, articleId) {
  const chapter = getChapter(bookId, chapterId), book = getBook(bookId)
  if (chapter && book) {
    const article = chapter.articles.find(item => item.id === articleId)
    const removed = article && { id: article.id, title: article.title, words: wordCount(article) }
    chapter.articles = chapter.articles.filter(item => item.id !== articleId)
    if (book.lastEdited?.articleId === articleId) book.lastEdited = null
    persist()
    if (removed) recordWordDelta(book.id, book.title, removed.id, removed.title, -removed.words)
  }
}
export function wordCount(article) { return (article?.paragraphs || []).join('').replace(/\s/g, '').length }

export function getLastEditedArticle(book) {
  if (!book) return null
  const chapter = book.chapters.find(item => item.id === book.lastEdited?.chapterId)
  const article = chapter?.articles.find(item => item.id === book.lastEdited?.articleId)
  if (article) return { chapterId: chapter.id, articleId: article.id, cursor: book.lastEdited.cursor || 0, title: article.title || '无题正文' }
  const candidates = book.chapters.flatMap(group => group.articles.map(item => ({ chapterId: group.id, articleId: item.id, cursor: 0, title: item.title || '无题正文', updatedAt: item.updatedAt || '' })))
  candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return candidates[0] || null
}
