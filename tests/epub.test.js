import test from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'
import { epubImageSource, parseEpub } from '../src/services/epub.js'

const container = '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=', 'base64'))
function archive(files) { return zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, typeof value === 'string' ? strToU8(value) : value]))) }

test('EPUB 3 imports title, author, cover, nested chapters, body and illustration', () => {
  const data = archive({
    'META-INF/container.xml': container,
    'OEBPS/book.opf': `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>雨夜书店</dc:title><dc:creator>林遥</dc:creator><dc:description>关于一张车票的故事</dc:description></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/><item id="fig" href="images/fig.png" media-type="image/png"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`,
    'OEBPS/nav.xhtml': `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/one.xhtml">第一章 初见</a><ol><li><a href="text/one.xhtml">雨中的书店</a></li></ol></li><li><a href="text/two.xhtml">第二章 回声</a></li></ol></nav></body></html>`,
    'OEBPS/text/one.xhtml': `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章 初见</h1><p>林遥走进书店。<img src="../images/fig.png" alt="车票"/>她发现车票。</p></body></html>`,
    'OEBPS/text/two.xhtml': `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章 回声</h1><p>第二天的故事。</p></body></html>`,
    'OEBPS/images/cover.png': png,
    'OEBPS/images/fig.png': png
  })
  const book = parseEpub(data, 'fallback.epub')
  assert.equal(book.title, '雨夜书店')
  assert.equal(book.author, '林遥')
  assert.match(book.cover, /^data:image\/png;base64,/) 
  assert.deepEqual(book.outline.map(chapter => chapter.title), ['第一章 初见', '第二章 回声'])
  assert.equal(book.outline[0].articles[0].title, '雨中的书店')
  assert.equal(book.sections[0].blocks.filter(block => block.type === 'paragraph').map(block => block.text).join(''), '林遥走进书店。她发现车票。')
  const image = book.sections[0].blocks.find(block => block.type === 'image')
  assert.equal(image.path, 'OEBPS/images/fig.png')
  assert.match(epubImageSource(book, image.path), /^data:image\/png;base64,/) 
})

test('EPUB 2 NCX identifies chapters and multiple anchors in one XHTML document', () => {
  const data = archive({
    'META-INF/container.xml': container,
    'OEBPS/book.opf': `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>单文件章节</dc:title><meta name="cover" content="cover"/></metadata><manifest><item id="story" href="story.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="cover" href="cover.png" media-type="image/png"/></manifest><spine toc="ncx"><itemref idref="story"/></spine></package>`,
    'OEBPS/toc.ncx': `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>第一章</text></navLabel><content src="story.xhtml#one"/></navPoint><navPoint><navLabel><text>第二章</text></navLabel><content src="story.xhtml#two"/></navPoint></navMap></ncx>`,
    'OEBPS/story.xhtml': `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="one">第一章</h1><p>第一章正文。</p><h1 id="two">第二章</h1><p>第二章正文。</p></body></html>`,
    'OEBPS/cover.png': png
  })
  const book = parseEpub(data)
  assert.equal(book.sections.length, 2)
  assert.deepEqual(book.outline.map(chapter => chapter.title), ['第一章', '第二章'])
  assert.match(book.sections[1].blocks.map(block => block.text).join(''), /第二章正文/)
  assert.match(book.cover, /^data:image\/png;base64,/)
})

test('invalid EPUB is rejected before importing an empty book', () => {
  assert.throws(() => parseEpub(new Uint8Array([1, 2])), /有效的 EPUB/)
})

test('imported EPUB metadata and recognized directory survive library storage', async () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value) }
  const { importReadOnlyBook } = await import('../src/store/library.js?epub-reader-test')
  const outline = [{ title: '第一章', articles: [{ id: 'epub-0', title: '第一节' }] }]
  const saved = importReadOnlyBook({ path: '_doc/reading/sample.epub', name: 'sample.epub', format: 'epub', cover: 'data:image/png;base64,AA==', outline }, { title: '自定义书名', author: '自定义作者' })
  assert.equal(saved.title, '自定义书名')
  assert.equal(saved.author, '自定义作者')
  assert.equal(saved.cover, 'data:image/png;base64,AA==')
  assert.deepEqual(saved.readOnly.outline, outline)
  assert.match(storage.get('paperwriter.library.v1'), /epub-0/)
  delete globalThis.uni
})
