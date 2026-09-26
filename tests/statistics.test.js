import test from 'node:test'
import assert from 'node:assert/strict'

test('daily word ledger keeps net negative changes and book sources', async () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value) }
  const { dayBookSources, recordWordDelta, useStatistics } = await import('../src/store/statistics.js')
  const date = new Date(2026, 8, 27)
  recordWordDelta('book-1', '测试书', 'article-1', '正文', 10, date)
  recordWordDelta('book-1', '测试书', 'article-1', '正文', -15, date)
  recordWordDelta('book-2', '另一书', 'article-2', '第二篇', 3, date)
  const day = useStatistics().days['2026-09-27']
  assert.equal(day.net, -2)
  assert.deepEqual(dayBookSources(day).map(book => [book.title, book.net]), [['测试书', -5], ['另一书', 3]])
  assert.equal(JSON.parse(storage.get('paperwriter.statistics.v1')).days['2026-09-27'].net, -2)
})
