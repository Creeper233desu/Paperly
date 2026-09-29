import test from 'node:test'
import assert from 'node:assert/strict'

test('books, chapters and articles survive storage reload', async () => {
  const storage = new Map()
  globalThis.uni = {
    getStorageSync: key => storage.get(key) || '',
    setStorageSync: (key, value) => storage.set(key, value)
  }
  const store = await import('../src/store/library.js')
  const book = store.addBook('测试书')
  store.updateBook(book.id, { author: '作者', description: '简介', cover: '_doc/cover.jpg' })
  const chapter = store.addChapter(book.id, '第一章')
  const article = store.addArticle(book.id, chapter.id)
  store.saveArticle(book.id, chapter.id, article.id, { title: '开篇', paragraphs: ['第一段', '第二段'], cursor: 4 })
  const saved = JSON.parse(storage.get('paperwriter.library.v1'))
  assert.equal(saved.books[0].chapters[0].articles[0].paragraphs[1], '第二段')
  assert.equal(saved.books[0].author, '作者')
  assert.equal(saved.books[0].cover, '_doc/cover.jpg')
  assert.equal(store.wordCount(article), 6)
  assert.equal(store.getLastEditedArticle(book).cursor, 4)
  const reloaded = await import('../src/store/library.js?reloaded=1')
  assert.deepEqual(reloaded.getArticle(book.id, chapter.id, article.id).paragraphs, ['第一段', '第二段'])
  assert.equal(reloaded.getLastEditedArticle(reloaded.getBook(book.id)).cursor, 4)
})

test('imported books never change the writing ledger when edited or deleted', async () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync:key => storage.get(key) || '', setStorageSync:(key,value) => storage.set(key,value) }
  const library = await import('../src/store/library.js?import-stat-test')
  const { useStatistics } = await import('../src/store/statistics.js')
  const before = JSON.stringify(useStatistics().days)
  const book = library.importBook({ title:'外部文稿', chapters:[
    { title:'第一章', articles:[{ title:'一', paragraphs:['原文'] }] },
    { title:'第二章', articles:[{ title:'二', paragraphs:['另一段'] }] },
    { title:'第三章', articles:[{ title:'三', paragraphs:['待删除'] }] }
  ] })
  assert.equal(book.origin,'imported')
  library.saveArticle(book.id, book.chapters[0].id, book.chapters[0].articles[0].id, { paragraphs:['改写后的文字'] })
  library.deleteArticle(book.id, book.chapters[0].id, book.chapters[0].articles[0].id)
  library.deleteChapter(book.id, book.chapters[1].id)
  library.deleteBook(book.id)
  assert.equal(JSON.stringify(useStatistics().days),before)
})
