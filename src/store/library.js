import { reactive } from 'vue'

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
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
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
  const book = { id: uid(), title: title.trim(), author: '', description: '', cover: '', createdAt: now(), updatedAt: now(), chapters: [] }
  state.books.unshift(book); persist(); return book
}
export function updateBook(id, patch) {
  const book = getBook(id); if (!book) return
  for (const key of ['title', 'author', 'description', 'cover']) {
    if (typeof patch[key] === 'string') book[key] = key === 'title' ? patch[key].trim() : patch[key]
  }
  book.updatedAt = now(); persist()
}
export function renameBook(id, title) { updateBook(id, { title }) }
export function deleteBook(id) { state.books = state.books.filter(book => book.id !== id); persist() }
export function addChapter(bookId, title) {
  const book = getBook(bookId); if (!book) return null
  const chapter = { id: uid(), title: title.trim(), articles: [] }
  book.chapters.push(chapter); book.updatedAt = now(); persist(); return chapter
}
export function renameChapter(bookId, id, title) { const ch = getChapter(bookId, id); if (ch) { ch.title = title.trim(); persist() } }
export function deleteChapter(bookId, id) { const book = getBook(bookId); if (book) { book.chapters = book.chapters.filter(ch => ch.id !== id); persist() } }
export function addArticle(bookId, chapterId, title = '') {
  const chapter = getChapter(bookId, chapterId); if (!chapter) return null
  const article = { id: uid(), title: title.trim(), paragraphs: [''], updatedAt: now() }
  chapter.articles.push(article); persist(); return article
}
export function saveArticle(bookId, chapterId, articleId, patch) {
  const article = getArticle(bookId, chapterId, articleId); if (!article) return
  if (typeof patch.title === 'string') article.title = patch.title
  if (Array.isArray(patch.paragraphs)) article.paragraphs = patch.paragraphs.map(String)
  article.updatedAt = now(); const book = getBook(bookId); if (book) book.updatedAt = article.updatedAt
  persist()
}
export function deleteArticle(bookId, chapterId, articleId) {
  const chapter = getChapter(bookId, chapterId)
  if (chapter) { chapter.articles = chapter.articles.filter(item => item.id !== articleId); persist() }
}
export function wordCount(article) { return (article?.paragraphs || []).join('').replace(/\s/g, '').length }
