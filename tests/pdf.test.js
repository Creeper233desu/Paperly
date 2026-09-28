import test from 'node:test'
import assert from 'node:assert/strict'
import { exportBookPdf } from '../src/services/pdf.js'
import { imageMarker } from '../src/utils/media.js'

test('PDF export writes pages through Native.js invoke for returned Canvas objects', () => {
  const drawn = []
  class Paint { setTypeface() {} setTextSize() {} setColor() {} measureText(text) { return text.length * 12 } }
  class PdfDocument {
    startPage() { return { getCanvas: () => ({ nativeCanvas: true }) } }
    finishPage() {}
    writeTo() {}
    close() {}
  }
  class Builder { create() { return {} } }
  class Stream { flush() {} close() {} }
  globalThis.plus = {
    os: { name: 'Android' },
    io: { convertLocalFileSystemURL: path => '/tmp/' + path },
    android: {
      importClass(name) {
        return ({
          'android.graphics.pdf.PdfDocument': PdfDocument,
          'android.graphics.Paint': Paint,
          'android.graphics.Typeface': { create: () => ({}) },
          'java.io.FileOutputStream': Stream,
          'android.graphics.pdf.PdfDocument$PageInfo$Builder': Builder
        })[name]
      },
      invoke(object, method, ...args) {
        if (method === 'drawText') { assert.equal(object.nativeCanvas, true); drawn.push(args[0]); return }
        throw new Error('Unexpected native method ' + method)
      }
    }
  }
  const path = exportBookPdf({ title: '测试书', author: '作者', chapters: [{ title: '第一章', articles: [{ title: '开篇', paragraphs: ['正文内容'] }] }] }, true)
  assert.match(path, /测试书-.*\.pdf$/)
  assert.ok(drawn.includes('测试书'))
  assert.ok(drawn.includes('作者'))
  assert.ok(drawn.includes('目录'))
  assert.ok(drawn.includes('正文内容'))
})

test('PDF export draws a saved article image between text paragraphs', () => {
  const drawn = []
  const bitmap = { width: 900, height: 600 }
  class Paint { setTypeface() {} setTextSize() {} setColor() {} measureText(text) { return text.length * 12 } }
  class PdfDocument { startPage() { return { getCanvas: () => ({ nativeCanvas: true }) } } finishPage() {} writeTo() {} close() {} }
  class Builder { create() { return {} } }
  class Stream { flush() {} close() {} }
  globalThis.plus = {
    os: { name: 'Android' }, io: { convertLocalFileSystemURL: path => `/tmp/${path}` },
    android: {
      importClass: name => ({
        'android.graphics.pdf.PdfDocument': PdfDocument, 'android.graphics.Paint': Paint,
        'android.graphics.Typeface': { create: () => ({}) }, 'java.io.FileOutputStream': Stream,
        'android.graphics.pdf.PdfDocument$PageInfo$Builder': Builder,
        'android.graphics.BitmapFactory': { decodeFile: path => { assert.equal(path, '/tmp/_doc/photo.jpg'); return bitmap } }
      })[name],
      invoke: (object, method, ...args) => {
        if (method === 'getWidth') return object.width
        if (method === 'getHeight') return object.height
        if (method === 'drawBitmap') { drawn.push('image'); assert.equal(args[0], bitmap) }
        if (method === 'drawText') drawn.push(args[0])
        if (method === 'recycle') drawn.push('recycled')
      }
    }
  }
  exportBookPdf({ title: '插图书', chapters: [{ title: '章', articles: [{ title: '', paragraphs: ['前文', imageMarker('img-1'), '后文'], images: { 'img-1': { path: '_doc/photo.jpg' } } }] }] }, false)
  assert.ok(drawn.indexOf('前文') < drawn.indexOf('image'))
  assert.ok(drawn.indexOf('image') < drawn.indexOf('后文'))
  assert.ok(drawn.includes('recycled'))
})
