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

test('background transparency produces the expected opaque PNG pixels in both themes', async t => {
  let createCanvas
  try { ({ createCanvas } = await import('@napi-rs/canvas')) } catch (_) { t.skip('Optional PDF canvas runtime is not installed'); return }
  const photo = createCanvas(20, 20), photoContext = photo.getContext('2d')
  photoContext.fillStyle = '#ff0000'; photoContext.fillRect(0, 0, 20, 20)
  for (const [style, base] of [['light', [251, 250, 247]], ['dark', [23, 27, 36]]]) {
    for (const opacity of [0, .3, 1]) {
      const output = createCanvas(1080, 460), context = output.getContext('2d')
      const ctx = { setFontSize: size => { context.font = `${size}px sans-serif` }, measureText: text => context.measureText(text), setGlobalAlpha: value => { context.globalAlpha = value }, setFillStyle: value => { context.fillStyle = value }, fillRect: (...args) => context.fillRect(...args), fillText: (...args) => context.fillText(...args), drawImage: (_, ...args) => context.drawImage(photo, ...args) }
      paintTextImage(ctx, layoutImageText(ctx, '正文'), style, { backgroundImage: { path: 'photo', width: 20, height: 20 }, backgroundOpacity: opacity })
      const pixel = Array.from(context.getImageData(540, 260, 1, 1).data)
      for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(pixel[channel] - (base[channel] * (1 - opacity) + [255, 0, 0][channel] * opacity)) <= 1)
      assert.equal(pixel[3], 255, 'image transparency must not make the card itself transparent')
    }
  }
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
const settleTasks = () => new Promise(resolve => setImmediate(resolve))

const filename = 'pages/export-image/index.vue'
const source = readFileSync(filename, 'utf8')
function pageHarness({ picker = async () => ({ path: 'photo', width: 100, height: 100 }), renderer = async () => '_tmp/card.png', albumSave = options => options.success({ path: 'album-copy' }), mirror = async () => {}, fontLoad = async () => {}, paragraphs = ['正文内容'] } = {}) {
  const removed = [], mirrored = [], albums = [], deletedPngs = [], opened = [], timers = new Map()
  let load, ready, unload, timerId = 0
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '')
  const context = {
    computed, ref, watch, nextTick: async () => {}, getCurrentInstance: () => ({ proxy: {} }),
    onLoad: callback => { load = callback }, onReady: callback => { ready = callback }, onUnload: callback => { unload = callback },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id }, clearTimeout: id => timers.delete(id),
    getBook: () => ({ title: '书名', chapters: [{ id: 'ch', title: '章节', articles: [{ id: 'a', title: '篇名', paragraphs }] }] }),
    loadPreferences: () => ({ font: 'system' }), loadSelectedFont: fontLoad, fontFamilyFor: () => '',
    textOnlyParagraphs: value => value, textRange, t: key => key,
    chooseBackgroundImage: picker, createTextPng: renderer, mirrorExport: async path => { mirrored.push(path); await mirror(path) },
    plus: { io: { resolveLocalFileSystemURL: (path, success) => success({ remove: done => { deletedPngs.push(path); done() } }) }, runtime: { openFile: path => opened.push(path) } },
    uni: { removeSavedFile: options => removed.push(options.filePath), showToast() {}, saveImageToPhotosAlbum: options => { albums.push(options.filePath); albumSave(options) } }
  }
  runInNewContext(script + '\nthis.page = { chooseBackground, removeBackground, changeTransparency, refreshPreview, generate, saveImage, shareImage, setSelection, selectedText, previewPath, previewError, backgroundImage, backgroundTransparency, backgroundOpacity, backgroundBusy, style, showBookInfo, generatedPath, savedPath, errorMessage, working, saving }', context)
  load({ bookId: 'b' })
  ready()
  return { ...context.page, removed, mirrored, albums, deletedPngs, opened, timers, unload }
}

test('live preview and confirmed PNG are the same image and only an explicit save writes to Gallery', async () => {
  const renders = []
  const page = pageHarness({ renderer: async options => { renders.push(options); return `_tmp/card-${renders.length}.png` } })
  await page.saveImage()
  await page.chooseBackground()
  page.changeTransparency({ detail: { value: 51 } })
  assert.equal(page.timers.size, 1, 'rapid changes coalesce into one preview update')
  const [{ callback, delay }] = page.timers.values()
  assert.equal(delay, 200)
  await callback()
  assert.equal(page.previewPath.value, '_tmp/card-1.png')
  assert.equal(page.generatedPath.value, '')
  assert.deepEqual(page.mirrored, [], 'preview does not create an export backup')
  assert.deepEqual(page.albums, [])
  await page.saveImage()
  await page.shareImage()
  assert.deepEqual(page.opened, [], 'an unconfirmed preview cannot be saved or shared')
  await page.generate()
  assert.equal(page.generatedPath.value, page.previewPath.value)
  assert.equal(renders.length, 1, 'confirming uses the exact preview file without another render')
  assert.equal(renders[0].text, page.selectedText.value)
  assert.equal(renders[0].backgroundOpacity, .49)
  assert.deepEqual(page.mirrored, ['_tmp/card-1.png'])
  await page.shareImage()
  assert.deepEqual(page.opened, ['_tmp/card-1.png'])
  assert.deepEqual(page.albums, [], 'generation and opening do not call the album API')
  await page.saveImage()
  await page.saveImage()
  assert.deepEqual(page.albums, ['_tmp/card-1.png'], 'repeat save does not create duplicate album copies')
  page.style.value = 'dark'
  assert.equal(page.previewPath.value, '')
  assert.equal(page.generatedPath.value, '')
  assert.deepEqual(page.deletedPngs, ['_tmp/card-1.png'])
  await page.saveImage()
  await page.refreshPreview()
  await page.generate()
  assert.equal(renders[1].style, 'dark')
  assert.equal(page.generatedPath.value, '_tmp/card-2.png')
  assert.deepEqual(page.albums, ['_tmp/card-1.png'])
  await page.saveImage()
  assert.deepEqual(page.albums, ['_tmp/card-1.png', '_tmp/card-2.png'])
  page.unload()
})

test('preview renders serialize, discard stale results, and preserve a background until its render finishes', async () => {
  const pending = deferred(), renders = []
  const page = pageHarness({ renderer: options => { renders.push(options); return renders.length === 1 ? pending.promise : Promise.resolve('_tmp/current.png') } })
  await page.chooseBackground()
  const first = page.refreshPreview()
  await settleTasks()
  page.changeTransparency({ detail: { value: 100 } })
  page.removeBackground()
  const latest = page.refreshPreview()
  assert.equal(renders.length, 1, 'never draw two requests onto the shared canvas at once')
  assert.deepEqual(page.removed, [])
  pending.resolve('_tmp/stale.png')
  await first; await latest
  assert.deepEqual(page.deletedPngs, ['_tmp/stale.png'])
  assert.deepEqual(page.removed, ['photo'])
  assert.equal(page.previewPath.value, '_tmp/current.png')
  assert.equal(renders[1].backgroundImage, null)
  assert.deepEqual(page.albums, [])
  assert.deepEqual(page.mirrored, [])
  page.unload()
  assert.deepEqual(page.deletedPngs, ['_tmp/stale.png', '_tmp/current.png'])
  assert.equal(page.timers.size, 0)
})

test('generation waits for an in-flight preview and selected font, then confirms the exact completed file', async () => {
  const font = deferred(), rendered = deferred()
  let count = 0
  const page = pageHarness({ fontLoad: () => font.promise, renderer: () => { count++; return rendered.promise } })
  const previewing = page.refreshPreview(), generating = page.generate()
  assert.equal(count, 0)
  font.resolve()
  await settleTasks()
  assert.equal(count, 1)
  rendered.resolve('_tmp/font-ready.png')
  await previewing; await generating
  assert.equal(count, 1)
  assert.equal(page.previewPath.value, '_tmp/font-ready.png')
  assert.equal(page.generatedPath.value, '_tmp/font-ready.png')
  assert.deepEqual(page.albums, [])
  page.unload()
})

test('real preview PNGs preserve export dimensions, central crop and identical bytes across themes and text lengths', async t => {
  let createCanvas, loadImage
  try { ({ createCanvas, loadImage } = await import('@napi-rs/canvas')) } catch (_) { t.skip('Optional PDF canvas runtime is not installed'); return }
  for (const [width, height] of [[240, 120], [120, 240]]) for (const style of ['light', 'dark']) for (const long of [false, true]) {
    const photo = createCanvas(width, height), photoContext = photo.getContext('2d')
    photoContext.fillStyle = '#ff0000'; photoContext.fillRect(0, 0, width, height)
    photoContext.fillStyle = '#00ff00'; photoContext.fillRect(width / 3, height / 3, width / 3, height / 3)
    const buffers = new Map()
    let output, context, size, renders = 0
    const api = {
      createCanvasContext: () => ({
        setFontSize: size => { if (!context) context = createCanvas(1, 1).getContext('2d'); context.font = `${size}px sans-serif` },
        measureText: text => context.measureText(text), setGlobalAlpha: value => { context.globalAlpha = value },
        setFillStyle: value => { context.fillStyle = value }, fillRect: (...args) => context.fillRect(...args),
        fillText: (...args) => context.fillText(...args), drawImage: (_, ...args) => context.drawImage(photo, ...args), draw: (_, done) => done()
      }),
      getImageInfo: options => options.success({ path: 'photo', width, height }),
      canvasToTempFilePath: options => {
        assert.deepEqual([options.width, options.height, options.destWidth, options.destHeight], [size.width, size.height, size.width, size.height])
        buffers.set('preview.png', output.toBuffer('image/png')); options.success({ tempFilePath: 'preview.png' })
      }
    }
    const page = pageHarness({ picker: async () => ({ path: 'photo', width, height }), paragraphs: [long ? '背景与正文应始终保持相同排版。'.repeat(40) : '正文'],
      renderer: options => {
        renders++
        return createTextPng({ ...options, api, settle: async () => {}, resize: layout => {
          size = layout; output = createCanvas(layout.width, layout.height); context = output.getContext('2d'); options.resize(layout)
        } })
      } })
    page.style.value = style; page.showBookInfo.value = long
    await page.chooseBackground()
    page.changeTransparency({ detail: { value: 51 } })
    await page.refreshPreview()
    const preview = buffers.get(page.previewPath.value)
    assert.ok(preview?.length > 0)
    const decoded = await loadImage(preview)
    assert.equal(decoded.width, 1080)
    assert.equal(decoded.height, size.height)
    assert.ok(long ? decoded.height > 460 : decoded.height === 460)
    const base = style === 'dark' ? [23, 27, 36] : [251, 250, 247]
    const centralPixel = Array.from(context.getImageData(540, Math.floor(size.height / 2), 1, 1).data)
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(centralPixel[channel] - (base[channel] * .51 + [0, 255, 0][channel] * .49)) <= 1)
    assert.equal(centralPixel[3], 255)
    await page.generate()
    assert.equal(renders, 1)
    assert.deepEqual(buffers.get(page.generatedPath.value), preview, 'confirmed PNG is byte-for-byte the displayed preview')
    assert.deepEqual(page.albums, [])
    page.unload()
  }
})

test('failed previews never enable saving, can be retried, and album failures do not mark a file saved', async () => {
  let count = 0, saveCount = 0
  const page = pageHarness({ renderer: async () => { if (++count === 1) throw new Error('render failed'); return '_tmp/retry.png' },
    albumSave: options => { if (++saveCount === 1) options.fail({ errMsg: 'permission denied' }); else options.success({ path: 'album-copy' }) } })
  await page.refreshPreview()
  assert.equal(page.previewError.value, 'render failed')
  assert.equal(page.previewPath.value, '')
  await page.saveImage()
  assert.deepEqual(page.albums, [])
  await page.refreshPreview()
  assert.equal(page.previewError.value, '')
  await page.generate()
  await page.saveImage()
  assert.equal(page.savedPath.value, '')
  assert.equal(page.errorMessage.value, 'permission denied')
  await page.saveImage()
  assert.equal(page.savedPath.value, 'album-copy')
  assert.equal(page.saving.value, false)
  page.unload()
})

test('settings changes and leaving retain PNGs until pending backups or explicit album saves finish', async () => {
  for (const operation of ['backup', 'album']) {
    const pending = deferred()
    let albumOptions
    const page = pageHarness({ mirror: () => operation === 'backup' ? pending.promise : Promise.resolve(), albumSave: options => { albumOptions = options } })
    const generating = page.generate()
    if (operation === 'backup') {
      await settleTasks()
      assert.deepEqual(page.mirrored, ['_tmp/card.png'])
    } else await generating
    const saving = operation === 'album' ? page.saveImage() : null
    if (operation === 'album') await page.saveImage()
    page.style.value = 'dark'
    page.unload()
    assert.deepEqual(page.deletedPngs, [])
    if (operation === 'backup') pending.resolve()
    else albumOptions.success({ path: 'album-copy' })
    await generating; await saving
    assert.deepEqual(page.deletedPngs, ['_tmp/card.png'])
    assert.equal(page.generatedPath.value, '')
    assert.equal(page.savedPath.value, '')
    assert.equal(page.albums.length, operation === 'album' ? 1 : 0)
  }
})

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
    await settleTasks()
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
  assert.match(descriptor.template.content, /:src="generatedPath \|\| previewPath" mode="widthFix"/)
  assert.doesNotMatch(descriptor.template.content, /preview-background|preview-copy|class="highlight"/)
  const errorsSource = readFileSync('src/services/image-export.js', 'utf8')
  const keys = [...source.matchAll(/\b(?:\$t|t)\('([^']+)'/g), ...errorsSource.matchAll(/new Error\('(背景图片[^']+|无法读取背景图片[^']+)'/g)]
  for (const [, key] of keys) for (const locale of ['en-US', 'ja-JP']) assert.ok(translations[locale][key], `${locale}: ${key}`)
})
