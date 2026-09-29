import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPdfDocument, buildPdfBook, pdfTextLines } from '../src/services/pdf-import.js'
import { samplePdf } from '../scripts/create-pdf-fixture.mjs'

test('a real compressed Chinese PDF yields editable chapters, paragraphs and metadata', async () => {
  const progress = []
  const { pages, metadata } = await extractPdfDocument(pdfjs, new Uint8Array(readFileSync(new URL('../fixtures/pdf-import-sample.pdf', import.meta.url))), { onProgress: value => progress.push(value.current) })
  const book = buildPdfBook(pages, metadata)
  assert.equal(book.title, '纸间 PDF 导入示例')
  assert.equal(book.author, '测试作者')
  assert.deepEqual(progress, [1, 2])
  assert.equal(book.chapters.length, 2)
  assert.equal(book.chapters[0].title, '第一章 初见')
  assert.ok(book.chapters[0].articles.some(article => article.title === '第一节 清晨'))
  const body = book.chapters.flatMap(chapter => chapter.articles.flatMap(article => article.paragraphs))
  assert.ok(body.includes('她推开窗，街上的风穿过树影，落在书页间。'))
  assert.ok(body.includes('最后一行保留了中文标点：你好，世界！'))
  assert.equal(book.warnings.length, 0)
})

test('image-only/blank PDFs and invalid data never create empty books', async () => {
  const { pages } = await extractPdfDocument(pdfjs, new Uint8Array(samplePdf({ blank:true })))
  assert.throws(() => buildPdfBook(pages), /OCR/)
  await assert.rejects(() => extractPdfDocument(pdfjs, new Uint8Array([1, 2, 3])), /有效的 PDF/)
})

test('repeated page headers and numbered footers are removed, body lines preserved', () => {
  const row = (text, y, page) => ({ text, y, page, x:50, right:500, size:14, pageHeight:842 })
  const pages = [1,2,3].map(number => [row('文稿页眉', 815, number), row(`正文${number}。`, 700, number), row(`${number}`, 20, number)])
  const book = buildPdfBook(pages, {}, '名字.pdf')
  assert.equal(book.title, '名字')
  assert.deepEqual(book.chapters[0].articles[0].paragraphs, ['正文1。', '正文2。', '正文3。'])
})

test('spaced PDF text fragments preserve English spaces without splitting Chinese', () => {
  const item = (str,x,width) => ({ str, width, transform:[14,0,0,14,x,700] })
  const lines = pdfTextLines({ items:[item('Hello',10,30),item('world',44,30),item('中文',80,28),item('段落',110,28)] },1)
  assert.equal(lines[0].text, 'Hello world 中文段落')
})

test('two-column PDFs read down the left column before the right column', () => {
  const items = []
  for (let row = 0; row < 3; row++) {
    items.push({ str:`左栏${row}`, width:140, transform:[14,0,0,14,50,700-row*22] })
    items.push({ str:`右栏${row}`, width:140, transform:[14,0,0,14,310,700-row*22] })
  }
  const lines = pdfTextLines({ items }, 1)
  assert.deepEqual(lines.map(line => line.text), ['左栏0','左栏1','左栏2','右栏0','右栏1','右栏2'])
  const book = buildPdfBook([lines])
  assert.deepEqual(book.chapters[0].articles[0].paragraphs, ['左栏0左栏1左栏2','右栏0右栏1右栏2'])
})

test('PDF import persists user metadata and allows normal editing, legacy conversion preserves ID', async () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync:key => storage.get(key), setStorageSync:(key,value) => storage.set(key,value) }
  const store = await import('../src/store/library.js?pdf-import-test')
  const { pages, metadata } = await extractPdfDocument(pdfjs, new Uint8Array(samplePdf()))
  const content = buildPdfBook(pages,metadata)
  const saved = store.importBook(content,{ title:'自定义书名', author:'作者' })
  assert.equal(saved.readOnly, undefined)
  const chapter = saved.chapters[1], article = chapter.articles[0]
  store.saveArticle(saved.id, chapter.id, article.id, { paragraphs:['修改后的 PDF 正文'] })
  assert.deepEqual(store.getArticle(saved.id,chapter.id,article.id).paragraphs,['修改后的 PDF 正文'])
  saved.readOnly = { format:'pdf', path:'_doc/old.pdf' }; saved.cover = '_doc/cover.png'
  store.replaceImportedContent(saved.id, content)
  assert.equal(store.useLibrary().books.length, 1)
  assert.equal(saved.readOnly, undefined)
  assert.equal(saved.cover, '_doc/cover.png')
  assert.equal(saved.title, '自定义书名')
  assert.ok(JSON.parse(storage.get('paperwriter.library.v1')).books[0].chapters.length)
  const legacy = store.addBook('未转换')
  legacy.readOnly = { format:'pdf', path:'_doc/keep.pdf' }
  const before = JSON.stringify(legacy), persisted = storage.get('paperwriter.library.v1')
  uni.setStorageSync = () => { throw new Error('storage full') }
  assert.throws(() => store.replaceImportedContent(legacy.id, content), /storage full/)
  assert.equal(JSON.stringify(legacy), before)
  assert.equal(storage.get('paperwriter.library.v1'), persisted)
  assert.equal(store.useLibrary().books.length, 2)
})
