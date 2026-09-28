import test from 'node:test'
import assert from 'node:assert/strict'
import { openPdfReader } from '../src/services/pdf-reader.js'

test('the in-app PDF renderer returns a displayable data URL and closes native resources', async () => {
  const closed = []
  const descriptor = { close: () => closed.push('descriptor') }
  const page = { getWidth: () => 500, getHeight: () => 700, render: () => {}, close: () => closed.push('page') }
  const bitmap = { eraseColor: () => {}, compress: (_format, _quality, stream) => { stream.file.size = 3; return true }, recycle: () => closed.push('bitmap') }
  class PdfRenderer { constructor() {} getPageCount() { return 2 } openPage(index) { assert.equal(index, 1); return page } close() { closed.push('renderer') } }
  class Output { constructor(file) { this.file = file } flush() {} close() { closed.push('output') } }
  class File {
    constructor(parent, name) { this.path = name ? `${parent.path}/${name}` : parent; this.size = 0 }
    exists() { return true }
    length() { return this.size }
    delete() { closed.push('cache'); return true }
  }
  const Descriptor = { open: (_file, mode) => { assert.equal(mode, 0x10000000); return descriptor } }
  const Bitmap = { createBitmap: (width, height) => { assert.equal(width, 1000); assert.equal(height, 1400); return bitmap } }
  globalThis.plus = { os: { name: 'Android' }, io: {
    convertLocalFileSystemURL: path => path === '_doc/' ? '/private' : '/private/book.pdf',
    FileReader: class { readAsDataURL() { this.onloadend({ target: { result: 'data:application/octet-stream;base64,/9j/' } }) } },
    resolveLocalFileSystemURL: (path, success) => {
      assert.match(path, /^_doc\/reader-cache\/page-.*\.jpg$/)
      success({ toRemoteURL: () => `http://localhost:13131/${path}`, toLocalURL: () => `file:///private/${path}`, file: callback => callback({ size: 3 }) })
    }
  }, android: {
    importClass: name => ({ 'java.io.File': File, 'android.os.ParcelFileDescriptor': Descriptor, 'android.graphics.pdf.PdfRenderer': PdfRenderer, 'android.graphics.Bitmap': Bitmap, 'android.graphics.Bitmap$Config': { ARGB_8888: 'argb' }, 'android.graphics.Bitmap$CompressFormat': { JPEG: 'jpeg' }, 'java.io.FileOutputStream': Output })[name],
    invoke: (receiver, method, ...args) => receiver[method](...args)
  } }
  const reader = openPdfReader('_doc/book.pdf')
  assert.equal(reader.count, 2)
  const result = await reader.render(1, 1000)
  assert.equal(result.height, 1400)
  assert.equal(result.src, 'data:image/jpeg;base64,/9j/')
  assert.match(result.fallbackSrc, /^http:\/\/localhost:13131\/_doc\/reader-cache\/page-.*\.jpg$/)
  plus.io.FileReader = class { readAsDataURL() { this.onerror() } }
  const fallback = await reader.render(1, 1000)
  assert.match(fallback.src, /^http:\/\/localhost:13131\/_doc\/reader-cache\/page-.*\.jpg$/)
  assert.match(fallback.fallbackSrc, /^file:\/\/\/private\/_doc\/reader-cache\/page-.*\.jpg$/)
  reader.close()
  reader.close()
  assert.deepEqual(closed, ['output', 'bitmap', 'page', 'output', 'bitmap', 'page', 'renderer', 'descriptor', 'cache', 'cache'])
  delete globalThis.plus
})
