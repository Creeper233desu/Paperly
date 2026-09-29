import test from 'node:test'
import assert from 'node:assert/strict'

test('PDF picker copies from a content stream and reads saved bytes', async () => {
  const bytes = Uint8Array.from([0x50, 0x4b, 3, 4, 5])
  const files = new Map()
  class File {
    constructor(parent, name) { this.path = name ? `${parent.path || parent}/${name}` : parent }
    exists() { return files.has(this.path) }
    mkdirs() { files.set(this.path, 0); return true }
    length() { return files.get(this.path) || 0 }
    delete() { files.delete(this.path); return true }
  }
  class Output {
    constructor(target) { this.target = target; files.set(target.path, 0) }
    getChannel() { return { transferFrom: (source, position, limit) => { const size = Math.min(source.remaining, limit); source.remaining -= size; files.set(this.target.path, position + size); return size }, close() {} } }
    flush() {}
    close() {}
  }
  class Intent {
    static ACTION_OPEN_DOCUMENT = 'open'
    static CATEGORY_OPENABLE = 'openable'
    static FLAG_GRANT_READ_URI_PERMISSION = 1
    addCategory() {}
    setType(value) { assert.equal(value, 'application/pdf') }
    addFlags() {}
  }
  const cursor = { moveToFirst: () => true, getColumnIndex: () => 0, getString: () => '小说.pdf', close() {} }
  const resolver = { query: () => cursor, getType: () => 'application/pdf', openInputStream: () => ({ remaining: bytes.length, close() {} }) }
  const activity = { onActivityResult: null, getContentResolver: () => resolver, startActivityForResult() { queueMicrotask(() => this.onActivityResult(28463, -1, { getData: () => 'content://pdf' })) } }
  globalThis.plus = {
    os: { name: 'Android' },
    io: { convertLocalFileSystemURL: () => '/private', resolveLocalFileSystemURL: (_path, success) => success({ file: callback => callback({ size: bytes.length }) }), FileReader: class { readAsDataURL() { this.onloadend({ target: { result: `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}` } }) } } },
    android: { runtimeMainActivity: () => activity, importClass: name => ({ 'android.content.Intent': Intent, 'java.io.File': File, 'java.io.FileInputStream': class {}, 'java.io.FileOutputStream': Output, 'java.nio.channels.Channels': { newChannel: source => source } })[name], invoke: (receiver, method, ...args) => receiver[method](...args) }
  }
  globalThis.uni = { base64ToArrayBuffer: value => Uint8Array.from(Buffer.from(value, 'base64')).buffer }
  const { pickAndroidPdf, readPdfBase64 } = await import('../src/services/android-pdf-picker.js')
  const file = await pickAndroidPdf()
  assert.equal(file.name, '小说.pdf')
  assert.equal(file.format, 'pdf')
  assert.equal(await readPdfBase64(file.path), Buffer.from(bytes).toString('base64'))
  delete globalThis.plus
  delete globalThis.uni
})
