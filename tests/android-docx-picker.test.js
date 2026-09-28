import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDocx } from '../src/services/docx-import.js'

test('Android document picker copies a DOCX from a content URI, reads it and removes the temporary copy', async () => {
  const bytes = readFileSync(new URL('../fixtures/docx-import-sample.docx', import.meta.url))
  const files = new Map(), removed = []
  const cursor = { moveToFirst: () => true, getColumnIndex: () => 0, getString: () => '纸间导入示例.docx', close: () => {} }
  const resolver = { query: () => cursor, openFileDescriptor: () => ({ getFileDescriptor: () => ({ remaining: bytes.length }), close: () => {} }) }
  class File {
    constructor(parent, name) { this.path = name ? `${parent.path || parent}/${name}` : parent }
    exists() { return files.has(this.path) }
    mkdirs() { files.set(this.path, 0); return true }
    length() { return files.get(this.path) || 0 }
    delete() { files.delete(this.path); return true }
  }
  class FileOutputStream {
    constructor(target) { this.target = target; files.set(target.path, 0) }
    getChannel() { return { transferFrom: (input, position, limit) => { const size = Math.min(input.remaining, limit); input.remaining -= size; files.set(this.target.path, position + size); return size }, close: () => {} } }
    flush() {}
    close() {}
  }
  class FileInputStream {
    constructor(descriptor) { this.descriptor = descriptor }
    getChannel() { return { get remaining() { return this.stream.descriptor.remaining }, set remaining(value) { this.stream.descriptor.remaining = value }, stream: this, close: () => {} } }
    close() {}
  }
  class Intent {
    static ACTION_OPEN_DOCUMENT = 'open'
    static CATEGORY_OPENABLE = 'openable'
    static FLAG_GRANT_READ_URI_PERMISSION = 1
    addCategory() {}
    setType(value) { assert.match(value, /wordprocessingml/) }
    addFlags() {}
  }
  const activity = { onActivityResult: null, getContentResolver: () => resolver, startActivityForResult() { queueMicrotask(() => this.onActivityResult(28462, -1, { getData: () => 'content://docx' })) } }
  globalThis.plus = {
    os: { name: 'Android' },
    io: {
      convertLocalFileSystemURL: () => '/data/app/doc',
      FileReader: class { readAsDataURL() { this.onloadend({ target: { result: `data:application/octet-stream;base64,${bytes.toString('base64')}` } }) } },
      resolveLocalFileSystemURL: (_path, success) => success({ file: callback => callback({}), remove: callback => { removed.push(_path); callback() } })
    },
    android: { runtimeMainActivity: () => activity, importClass: name => ({ 'android.content.Intent': Intent, 'java.io.File': File, 'java.io.FileInputStream': FileInputStream, 'java.io.FileOutputStream': FileOutputStream })[name], invoke: (receiver, method, ...args) => receiver[method](...args) }
  }
  globalThis.uni = { base64ToArrayBuffer: value => Uint8Array.from(Buffer.from(value, 'base64')).buffer }
  const { pickAndroidDocx } = await import('../src/services/android-docx-picker.js')
  const picked = await pickAndroidDocx()
  assert.equal(picked.name, '纸间导入示例.docx')
  assert.equal(parseDocx(picked.bytes).title, '纸间导入示例')
  assert.equal(removed.length, 1)
  assert.match(removed[0], /^_doc\/imports\/import-.*\.docx$/)
})
