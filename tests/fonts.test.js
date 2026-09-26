import test from 'node:test'
import assert from 'node:assert/strict'

test('Android font picker copies TTF and OTF through channels and offers local preview sources', async () => {
  const files = new Map()
  let selectedName = '手写字体.ttf'
  let selectedMime = 'font/ttf'
  const cursor = {
    moveToFirst: () => true,
    getColumnIndex: () => 0,
    getString: () => selectedName,
    close: () => {}
  }
  const resolver = {
    query: () => cursor,
    getType: () => selectedMime,
    openInputStream: () => ({ remaining: 4200, close: () => {} })
  }
  class File {
    constructor(parent, name) { this.path = name ? `${parent.path || parent}/${name}` : parent }
    exists() { return files.has(this.path) }
    mkdirs() { files.set(this.path, 0); return true }
    length() { return files.get(this.path) || 0 }
    delete() { files.delete(this.path); return true }
  }
  class FileOutputStream {
    constructor(target) {
      this.target = target
      files.set(target.path, 0)
    }
    getChannel() {
      return {
        transferFrom: (input, position, limit) => {
          const count = Math.min(input.remaining, limit)
          input.remaining -= count
          files.set(this.target.path, position + count)
          return count
        },
        close: () => {}
      }
    }
    flush() {}
    close() {}
  }
  class Intent {
    static ACTION_OPEN_DOCUMENT = 'open'
    static CATEGORY_OPENABLE = 'openable'
    static FLAG_GRANT_READ_URI_PERMISSION = 1
    addCategory() {}
    setType() {}
    addFlags() {}
  }
  const activity = {
    onActivityResult: null,
    getContentResolver: () => resolver,
    startActivityForResult() {
      queueMicrotask(() => this.onActivityResult(28461, -1, { getData: () => 'content://font' }))
    }
  }
  globalThis.plus = {
    os: { name: 'Android' },
    io: { convertLocalFileSystemURL: path => path === '_doc/' ? '/data/app/doc' : `/data/app/doc/${path.slice('_doc/'.length)}` },
    android: {
      runtimeMainActivity: () => activity,
      importClass: name => ({
        'android.content.Intent': Intent,
        'java.io.File': File,
        'java.io.FileOutputStream': FileOutputStream,
        'java.nio.channels.Channels': { newChannel: input => input }
      })[name],
      invoke: (receiver, method, ...args) => receiver[method](...args)
    }
  }
  const sources = []
  globalThis.uni = {
    getStorageSync: () => '',
    loadFontFace: ({ source, success, fail }) => {
      sources.push(source)
      if (sources.length === 1) fail({ errMsg: 'try next path' })
      else success()
    }
  }
  const { pickAndroidFont, loadCustomFont } = await import('../src/services/fonts.js')
  const font = await pickAndroidFont()
  assert.match(font.path, /^_doc\/fonts\/.*\.ttf$/)
  assert.equal(font.name, '手写字体')
  assert.equal(files.get('/data/app/doc/fonts/' + font.path.split('/').pop()), 4200)
  await loadCustomFont(font)
  assert.match(sources[0], /^url\("file:\/\/\/data\/app\/doc\/fonts\//)
  assert.match(sources[1], /^url\("\/data\/app\/doc\/fonts\//)
  selectedName = '另一字体.otf'
  selectedMime = 'font/otf'
  const otf = await pickAndroidFont()
  assert.match(otf.path, /^_doc\/fonts\/.*\.otf$/)
  assert.equal(otf.name, '另一字体')
  assert.equal(files.get('/data/app/doc/fonts/' + otf.path.split('/').pop()), 4200)
})
