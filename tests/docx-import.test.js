import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDocx, importedBookSummary } from '../src/services/docx-import.js'

const fixture = new URL('../fixtures/docx-import-sample.docx', import.meta.url)

test('DOCX import reads metadata, styled headings and unstyled chapter fallbacks', () => {
  const result = parseDocx(readFileSync(fixture), 'sample.docx')
  assert.equal(result.title, '纸间导入示例')
  assert.equal(result.author, '测试作者')
  assert.match(result.description, /章节识别/)
  assert.deepEqual(result.chapters.map(item => item.title), ['第一章 初见', '第二章 回声', '第三章 尾声'])
  assert.deepEqual(result.chapters.map(item => item.articles.map(article => article.title)), [
    ['第一节 雨中的书店', '第二节 未寄出的信'], ['第一节 清晨的站台'], ['第一节 新的一页']
  ])
  assert.match(result.chapters[0].articles[0].paragraphs[1], /店主说/)
  assert.deepEqual(importedBookSummary(result), { chapters: 3, articles: 4, words: 146 })
})

test('imported DOCX becomes a saved book with user-edited metadata', async () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value) }
  const store = await import('../src/store/library.js?docx-import-test')
  const parsed = parseDocx(readFileSync(fixture))
  const saved = store.importBook(parsed, { title: '修改后的书名', author: '我', description: '新的简介' })
  assert.equal(saved.title, '修改后的书名')
  assert.equal(saved.author, '我')
  assert.equal(saved.chapters[2].articles[0].paragraphs.length, 1)
  assert.equal(store.getLastEditedArticle(saved).articleId, saved.chapters[0].articles[0].id)
  assert.equal(JSON.parse(storage.get('paperwriter.library.v1')).books[0].description, '新的简介')
})

test('invalid DOCX data never creates an empty book', () => {
  assert.throws(() => parseDocx(new Uint8Array([1, 2, 3]), 'bad.docx'), /有效的 DOCX/)
})
