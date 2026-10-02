import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref, watch } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createTextPng, layoutImageText, paintTextImage } from '../src/services/image-export.js'
import { textRange } from '../src/utils/text-range.js'
import { translations } from '../src/i18n.js'

function canvas() {
  const calls = []
  let alpha = 1, color = ''
  const ctx = {
    setFontSize() {}, measureText: text => ({ width: text.length * 34 }),
    setGlobalAlpha: value => { alpha = value }, setFillStyle: value => { color = value },
    fillRect: (...args) => calls.push({ type: 'rect', alpha, color, args }),
    fillText: (...args) => calls.push({ type: 'text', alpha, color, args }),
    drawImage: (...args) => calls.push({ type: 'image', alpha, args }),
    draw: (_, done) => { calls.push({ type: 'draw' }); done() }
  }
  return { ctx, calls }
}

test('both themes keep text opaque and place a centered, proportional background below it', () => {
  for (const style of ['light', 'dark']) {
    for (const [width, height] of [[2000, 1000], [500, 2000]]) {
      const { ctx, calls } = canvas()
      const layout = layoutImageText(ctx, '正文', '书名')
      paintTextImage(ctx, layout, style, { backgroundImage: { path: '_doc/photo.jpg', width, height }, backgroundOpacity: .3 })
      assert.equal(calls[0].color, style === 'dark' ? '#171b24' : '#fbfaf7')
      assert.equal(calls[0].alpha, 1)
      const image = calls[1]
      assert.equal(image.type, 'image')
      assert.equal(image.alpha, .3)
      const [path, sx, sy, sw, sh, dx, dy, dw, dh] = image.args
      assert.equal(path, '_doc/photo.jpg')
      assert.ok(Math.abs(sw / sh - layout.width / layout.height) < 1e-10)
      assert.ok(Math.abs(sx - (width - sw) / 2) < 1e-10)
      assert.ok(Math.abs(sy - (height - sh) / 2) < 1e-10)
      assert.ok(sx >= 0 && sy >= 0 && sw <= width && sh <= height)
      assert.deepEqual([dx, dy, dw, dh], [0, 0, layout.width, layout.height])
      const text = calls.find(call => call.type === 'text' && call.args[0] === '正文')
      assert.equal(text.alpha, 1)
      assert.equal(text.color, style === 'dark' ? '#f0eee8' : '#252a32')
      assert.ok(calls.findIndex(call => call.type === 'text') > 1)
    }
  }
})

test('transparency endpoints and missing backgrounds retain the original card', () => {
  for (const opacity of [0, -1, 1, 2, Number.NaN]) {
    const { ctx, calls } = canvas()
    paintTextImage(ctx, layoutImageText(ctx, '正文'), 'light', { backgroundImage: { path: 'photo', width: 100, height: 100 }, backgroundOpacity: opacity })
    const image = calls.find(call => call.type === 'image')
    if (opacity <= 0) assert.equal(image, undefined)
    else assert.equal(image.alpha, Number.isNaN(opacity) ? .3 : 1)
    assert.equal(calls.find(call => call.type === 'text').alpha, 1)
  }
  const { ctx, calls } = canvas()
  paintTextImage(ctx, layoutImageText(ctx, '正文'), 'dark')
  assert.ok(!calls.some(call => call.type === 'image'))
})

test('PNG export resolves the image before drawing and exporting the composite', async () => {
  const { ctx, calls } = canvas()
  const api = {
    createCanvasContext: () => ctx,
    getImageInfo: options => { assert.equal(options.src, '_doc/photo.jpg'); calls.push({ type: 'read' }); options.success({ path: '/resolved/photo.jpg', width: 1600, height: 900 }) },
    canvasToTempFilePath: options => { calls.push({ type: 'export' }); assert.equal(options.fileType, 'png'); options.success({ tempFilePath: '_tmp/card.png' }) }
  }
  const path = await createTextPng({ canvasId: 'card', text: '正文', backgroundImage: { path: '_doc/photo.jpg' }, backgroundOpacity: .5, resize: () => calls.push({ type: 'resize' }), nextFrame: async () => {}, settle: async () => {}, api })
  assert.equal(path, '_tmp/card.png')
  assert.equal(calls.find(call => call.type === 'image').args[0], '/resolved/photo.jpg')
  assert.equal(calls.find(call => call.type === 'image').alpha, .5)
  assert.deepEqual(calls.filter(call => ['read', 'resize', 'image', 'draw', 'export'].includes(call.type)).map(call => call.type), ['read', 'resize', 'image', 'draw', 'export'])
})

test('unreadable or invalid images fail instead of exporting a card without the chosen background', async () => {
  for (const result of [null, { width: 0, height: 100 }, { width: Infinity, height: 100 }]) {
    let exported = false
    await assert.rejects(createTextPng({ canvasId: 'card', text: '正文', backgroundImage: { path: 'missing' }, resize() {}, nextFrame: async () => {}, settle: async () => {}, api: {
      createCanvasContext: () => canvas().ctx,
      getImageInfo: options => result ? options.success(result) : options.fail({ errMsg: 'missing file' }),
      canvasToTempFilePath: () => { exported = true }
    } }), /背景图片/)
    assert.equal(exported, false)
  }
})

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const filename = 'pages/export-image/index.vue'
const source = readFileSync(filename, 'utf8')
function pageHarness({ picker = async () => ({ path: 'photo', width: 100, height: 100 }), renderer = async () => '_tmp/card.png' } = {}) {
  const removed = [], mirrored = []
  let load, unload
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '')
  const context = {
    computed, ref, watch, nextTick: async () => {}, getCurrentInstance: () => ({ proxy: {} }),
    onLoad: callback => { load = callback }, onUnload: callback => { unload = callback },
    getBook: () => ({ title: '书名', chapters: [{ id: 'ch', title: '章节', articles: [{ id: 'a', title: '篇名', paragraphs: ['正文内容'] }] }] }),
    loadPreferences: () => ({ font: 'system' }), loadSelectedFont: async () => {}, fontFamilyFor: () => '',
    textOnlyParagraphs: value => value, textRange, t: key => key,
    chooseBackgroundImage: picker, createTextPng: renderer, mirrorExport: async path => { mirrored.push(path) },
    uni: { removeSavedFile: options => removed.push(options.filePath) }
  }
  runInNewContext(script + '\nthis.page = { chooseBackground, removeBackground, changeTransparency, generate, backgroundImage, backgroundTransparency, backgroundOpacity, backgroundBusy, style, showBookInfo, generatedPath, savedPath, errorMessage, working }', context)
  load({ bookId: 'b' })
  return { ...context.page, removed, mirrored, unload }
}

test('choose, replace and remove release saved background files and invalidate exported PNGs', async () => {
  let count = 0
  const page = pageHarness({ picker: async () => ({ path: `photo-${++count}`, width: 100, height: 100 }) })
  await page.chooseBackground()
  assert.equal(page.backgroundImage.value.path, 'photo-1')
  await page.generate()
  assert.equal(page.generatedPath.value, '_tmp/card.png')
  page.savedPath.value = 'album-copy'
  page.changeTransparency({ detail: { value: 100 } })
  assert.equal(page.backgroundOpacity.value, 0)
  assert.equal(page.generatedPath.value, '')
  assert.equal(page.savedPath.value, '')
  page.changeTransparency({ detail: { value: 0 } })
  assert.equal(page.backgroundOpacity.value, 1)
  await page.chooseBackground()
  assert.deepEqual(page.removed, ['photo-1'])
  page.removeBackground()
  assert.equal(page.backgroundImage.value, null)
  assert.deepEqual(page.removed, ['photo-1', 'photo-2'])
})

test('cancelled replacement preserves the chosen image and a late selection is cleaned up after leaving', async () => {
  const pending = deferred()
  let count = 0
  const page = pageHarness({ picker: () => ++count === 1 ? Promise.resolve({ path: 'photo' }) : count === 2 ? Promise.reject(new Error('chooseImage:fail cancel')) : pending.promise })
  await page.chooseBackground()
  await page.chooseBackground()
  assert.equal(page.backgroundImage.value.path, 'photo')
  assert.equal(page.errorMessage.value, '')
  const choosing = page.chooseBackground()
  await page.generate()
  assert.equal(page.generatedPath.value, '')
  page.unload()
  pending.resolve({ path: 'late-photo' })
  await choosing
  assert.deepEqual(page.removed, ['photo', 'late-photo'])
})

test('changes during generation cannot restore an old PNG and unloading keeps the image until drawing completes', async () => {
  for (const leave of [false, true]) {
    const pending = deferred()
    let settings
    const page = pageHarness({ renderer: options => { settings = options; return pending.promise } })
    await page.chooseBackground()
    const generating = page.generate()
    assert.equal(settings.backgroundImage.path, 'photo')
    assert.ok(Math.abs(settings.backgroundOpacity - .3) < 1e-10)
    page.removeBackground()
    assert.deepEqual(page.removed, [])
    if (leave) page.unload()
    else page.style.value = 'dark'
    assert.deepEqual(page.removed, [])
    pending.resolve('_tmp/stale.png')
    await generating
    assert.equal(page.generatedPath.value, '')
    assert.deepEqual(page.mirrored, [])
    assert.deepEqual(page.removed, leave ? ['photo'] : [])
    assert.equal(page.working.value, false)
  }
})

test('the updated page compiles and its UI and background errors have English and Japanese translations', () => {
  const { descriptor, errors } = parse(source, { filename })
  assert.deepEqual(errors, [])
  assert.doesNotThrow(() => compileScript(descriptor, { id: 'image-export' }))
  const result = compileTemplate({ source: descriptor.template.content, filename, id: 'image-export' })
  assert.deepEqual(result.errors, [])
  const errorsSource = readFileSync('src/services/image-export.js', 'utf8')
  const keys = [...source.matchAll(/\b(?:\$t|t)\('([^']+)'/g), ...errorsSource.matchAll(/new Error\('(背景图片[^']+|无法读取背景图片[^']+)'/g)]
  for (const [, key] of keys) for (const locale of ['en-US', 'ja-JP']) assert.ok(translations[locale][key], `${locale}: ${key}`)
})
