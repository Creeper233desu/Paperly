import test from 'node:test'
import assert from 'node:assert/strict'
import { saveEpubCover } from '../src/services/epub-cover.js'

test('EPUB cover is persisted to an app-private image file for the bookshelf', () => {
  const content = Uint8Array.from([1, 2, 3, 4])
  class File {
    constructor(parent, name) { this.path = name ? `${parent.path || parent}/${name}` : parent; this.size = 0 }
    exists() { return false }
    mkdirs() { return true }
    length() { return this.size }
    delete() { return true }
  }
  class Output {
    constructor(target) { this.target = target }
    getChannel() { return { write: buffer => { const size = buffer.remaining; buffer.remaining = 0; this.target.size += size; return size }, close() {} } }
    flush() {}
    close() {}
  }
  globalThis.plus = { os: { name: 'Android' }, io: { convertLocalFileSystemURL: () => '/private' }, android: {
    importClass: name => ({ 'java.io.File': File, 'java.io.FileOutputStream': Output, 'android.util.Base64': { decode: encoded => Uint8Array.from(Buffer.from(encoded, 'base64')) }, 'java.nio.ByteBuffer': { wrap: bytes => ({ remaining: bytes.length, hasRemaining() { return this.remaining > 0 } }) } })[name],
    invoke: (receiver, method, ...args) => receiver[method](...args)
  } }
  const saved = saveEpubCover({ coverPath: 'Images/cover.png', resources: { 'Images/cover.png': content } })
  assert.match(saved, /^_doc\/reading-covers\/cover-.*\.png$/)
  delete globalThis.plus
})
