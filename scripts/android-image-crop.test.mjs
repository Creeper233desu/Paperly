// Run with: npm run test:image-crop
import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseArticleImage } from '../src/services/article-images.js'
import { chooseBookCover } from '../src/services/covers.js'
import { getImageCropRequest, finishImageCrop, cancelImageCrop } from '../src/services/image-crop.js'

const PHOTO = 'android.provider.action.PICK_IMAGES'
const CONTENT = 'android.intent.action.GET_CONTENT'
const DOCUMENT = 'android.intent.action.OPEN_DOCUMENT'
const contexts = new WeakSet()

function androidFixture(t, options = {}) {
  if (!contexts.has(t)) {
    contexts.add(t)
    const previousPlus = globalThis.plus
    t.after(() => {
      if (previousPlus === undefined) delete globalThis.plus
      else globalThis.plus = previousPlus
    })
  }
  const files = new Map(), launches = [], removed = [], closed = [], saved = []
  const bytes = options.bytes ?? 12
  const stream = { remaining: bytes, close() { closed.push('input') } }
  class File {
    constructor(parent, name) { this.path = name ? `${String(parent.path || parent).replace(/\/$/, '')}/${name}` : parent }
    exists() { return files.has(this.path) }
    mkdirs() { files.set(this.path, 0); return true }
    length() { return files.get(this.path) || 0 }
    delete() { removed.push(this.path); files.delete(this.path); return true }
  }
  class Output {
    constructor(target) { this.target = target; files.set(target.path, 0) }
    getChannel() {
      return {
        transferFrom: (source, position, limit) => {
          if (options.copyError) throw new Error('provider read failed')
          const size = Math.min(source.remaining, limit)
          source.remaining -= size
          files.set(this.target.path, position + size)
          return size
        },
        close() { closed.push('output-channel') }
      }
    }
    flush() {}
    close() { closed.push('output') }
  }
  class Input {
    constructor(descriptor) { this.descriptor = descriptor }
    getChannel() { return this.descriptor }
    close() { closed.push('descriptor-input') }
  }
  class Intent {
    constructor(action) { this.action = action; this.categories = [] }
    setType(type) { this.type = type }
    addFlags(flags) { this.flags = flags }
    addCategory(category) { this.categories.push(category) }
  }
  const resolver = {
    getType() { return options.mime ?? 'image/png' },
    openInputStream(uri) {
      assert.equal(uri, 'content://selected-photo')
      if (options.descriptorOnly) throw new Error('stream unavailable')
      return stream
    },
    openFileDescriptor(uri, mode) {
      assert.equal(uri, 'content://selected-photo')
      assert.equal(mode, 'r')
      return { getFileDescriptor: () => stream, close() { closed.push('descriptor') } }
    }
  }
  const forwarded = []
  const previous = (...args) => forwarded.push(args)
  const activity = {
    onActivityResult: previous,
    getContentResolver: () => resolver,
    startActivityForResult(intent, code) {
      launches.push(intent)
      assert.equal(code, 28464)
      assert.equal(intent.type, 'image/*')
      assert.equal(intent.flags, 1)
      if (options.unsupported?.includes(intent.action)) throw new Error('ActivityNotFoundException')
      if (options.manualResult) return
      const handler = this.onActivityResult
      queueMicrotask(() => handler(code, options.cancel ? 0 : -1,
        options.cancel ? null : { getData() {
          if (options.uriError) throw new Error('bad URI')
          return options.noUri ? null : 'content://selected-photo'
        } }))
    }
  }
  globalThis.plus = {
    os: { name: 'Android' },
    io: {
      convertLocalFileSystemURL: path => path.startsWith('_doc/') ? path.replace('_doc/', '/private/') : path,
      resolveLocalFileSystemURL(path, success) {
        success({ remove(callback) { removed.push(path); files.delete(path.replace('_doc/', '/private/')); callback() } })
      }
    },
    android: {
      runtimeMainActivity: () => activity,
      importClass: name => ({ 'android.content.Intent': Intent, 'java.io.File': File,
        'java.io.FileInputStream': Input, 'java.io.FileOutputStream': Output,
        'java.nio.channels.Channels': { newChannel: source => source } })[name],
      invoke: (receiver, method, ...args) => receiver[method](...args)
    }
  }
  let cropId = ''
  const api = {
    chooseImage() { assert.fail('Android must use its system photo picker') },
    getImageInfo: options => options.success({ width: 640, height: 480, type: 'png' }),
    navigateTo: options => { cropId = new URL(options.url, 'https://app.local').searchParams.get('id') }
  }
  async function waitForCrop() {
    for (let count = 0; !cropId && count < 100; count++) await new Promise(resolve => setTimeout(resolve, 1))
    assert.ok(cropId, 'the copied photo must reach the app crop page')
    return getImageCropRequest(cropId)
  }
  const confirm = () => finishImageCrop(cropId, { path: '_doc/cropped.png', width: 336, height: 480 })
  const cancelCrop = () => cancelImageCrop(cropId)
  return { api, activity, previous, forwarded, files, launches, removed, closed, waitForCrop, confirm, cancelCrop }
}

test('system photo URI remains readable through manual crop confirmation and is cleaned afterwards', async t => {
  for (const choose of [chooseBookCover, chooseArticleImage]) {
    const fixture = androidFixture(t)
    const selecting = choose(fixture.api)
    const request = await fixture.waitForCrop()
    assert.match(request.image.path, /^_doc\/image-picker\//)
    assert.equal(fixture.removed.length, 0)
    assert.equal(fixture.activity.onActivityResult, fixture.previous)
    assert.equal(fixture.files.get(request.image.path.replace('_doc/', '/private/')), 12)
    fixture.confirm()
    const result = await selecting
    assert.equal(choose === chooseBookCover ? result : result.path, '_doc/cropped.png')
    assert.deepEqual(fixture.launches.map(intent => intent.action), [PHOTO])
    assert.equal(fixture.removed.length, 1)
    assert.ok(!fixture.removed.includes('_doc/cropped.png'))
  }
})

test('older Android pickers and descriptor-only providers still feed the app crop page', async t => {
  for (const options of [{ unsupported: [PHOTO] }, { unsupported: [PHOTO, CONTENT], descriptorOnly: true }]) {
    const fixture = androidFixture(t, options), selecting = chooseArticleImage(fixture.api)
    await fixture.waitForCrop(); fixture.confirm(); await selecting
    assert.deepEqual(fixture.launches.map(intent => intent.action), [...options.unsupported, options.unsupported.length === 1 ? CONTENT : DOCUMENT])
    assert.equal(fixture.activity.onActivityResult, fixture.previous)
    if (options.descriptorOnly) assert.ok(fixture.closed.includes('descriptor'))
  }
})

test('cancelling either system selection or app cropping releases callbacks, locks and staging files', async t => {
  const first = androidFixture(t, { cancel: true })
  await assert.rejects(chooseBookCover(first.api), /已取消选择/)
  assert.equal(first.launches.length, 1)
  assert.equal(first.activity.onActivityResult, first.previous)
  const second = androidFixture(t), selecting = chooseArticleImage(second.api)
  await second.waitForCrop(); second.cancelCrop()
  await assert.rejects(selecting, /已取消选择/)
  assert.equal(second.removed.length, 1)
  const third = androidFixture(t), next = chooseBookCover(third.api)
  await third.waitForCrop(); third.confirm(); await next
})

test('empty and interrupted provider copies close resources and cannot open the crop page', async t => {
  for (const options of [{ bytes: 0 }, { copyError: true }]) {
    const fixture = androidFixture(t, options)
    await assert.rejects(chooseArticleImage(fixture.api), /无法读取图片|provider read failed/)
    assert.equal(fixture.activity.onActivityResult, fixture.previous)
    assert.ok(fixture.closed.includes('output'))
    assert.ok(![...fixture.files.keys()].some(path => /\/image-\d/.test(path)))
  }
})
