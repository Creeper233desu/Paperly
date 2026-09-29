import { reactive } from 'vue'
import { queueDirectorySync } from '../services/data-directory.js'

const KEY = 'paperwriter.statistics.v1'
const state = reactive({ days: {} })
let loaded = false

export function localDayKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function useStatistics() {
  if (!loaded) {
    loaded = true
    try {
      const raw = uni.getStorageSync(KEY)
      const saved = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw
      if (saved?.days && typeof saved.days === 'object') state.days = saved.days
    } catch (error) { console.warn('读取字数统计失败', error) }
  }
  return state
}
export function reloadStatistics() { loaded = false; state.days = {}; useStatistics() }

export function recordWordDelta(bookId, bookTitle, articleId, articleTitle, delta, date = new Date()) {
  if (!Number.isFinite(delta) || delta === 0) return
  useStatistics()
  const key = localDayKey(date)
  const day = state.days[key] || { net: 0, books: {} }
  const book = day.books[bookId] || { title: bookTitle, net: 0, articles: {} }
  const article = book.articles[articleId] || { title: articleTitle || '无题正文', net: 0 }
  article.net += delta
  article.title = articleTitle || '无题正文'
  book.articles[articleId] = article
  book.net += delta
  book.title = bookTitle
  day.books[bookId] = book
  day.net += delta
  state.days[key] = day
  try {
    uni.setStorageSync(KEY, JSON.stringify({ version: 1, days: state.days }))
    queueDirectorySync()
  } catch (error) { console.warn('保存字数统计失败', error) }
}

export function dayBookSources(day) {
  return Object.entries(day?.books || {})
    .map(([id, book]) => ({ id, ...book }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}
