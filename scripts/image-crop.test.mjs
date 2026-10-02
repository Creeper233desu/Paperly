import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { centeredCrop, moveCrop, resizeCrop, fitImage, cropOutputSize } from '../src/utils/image-crop.js'
import { requestImageCrop, getImageCropRequest, finishImageCrop, cancelImageCrop, createCroppedImage } from '../src/services/image-crop.js'
import { chooseArticleImage } from '../src/services/article-images.js'
import { chooseBookCover } from '../src/services/covers.js'
import { chooseBackgroundImage } from '../src/services/image-picker.js'
import { translations } from '../src/i18n.js'

test('moving and resizing each corner stays inside the photo and preserves locked ratios', () => {
  for (const image of [{ width: 2400, height: 1600 }, { width: 600, height: 1800 }, { width: 10, height: 20 }]) {
    for (const ratio of [0, .7, 1, 16 / 9]) {
      const initial = centeredCrop(image, ratio)
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        for (const [dx, dy] of [[50, 30], [-80, -40], [5000, 3000], [-5000, -3000]]) {
          const crop = resizeCrop(image, initial, corner, dx, dy, ratio)
          assert.ok(crop.width > 0 && crop.height > 0)
          assert.ok(crop.x >= -.01 && crop.y >= -.01)
          assert.ok(crop.x + crop.width <= image.width + .01 && crop.y + crop.height <= image.height + .01)
          if (ratio) assert.ok(Math.abs(crop.width / crop.height - ratio) < 1e-10)
          const moved = moveCrop(image, crop, 9999, -9999)
          assert.equal(moved.y, 0)
          assert.ok(Math.abs(moved.x + moved.width - image.width) < 1e-10)
        }
      }
    }
  }
})

test('display coordinates preserve the image and output dimensions bound mobile memory without upscaling', () => {
  assert.deepEqual(fitImage({ width: 1600, height: 800 }, { width: 400, height: 400 }), { x: 0, y: 100, width: 400, height: 200, scale: .25 })
  assert.deepEqual(cropOutputSize({ width: 80, height: 40 }), { width: 80, height: 40 })
  const output = cropOutputSize({ width: 12000, height: 10000 })
  assert.ok(output.width <= 2560 && output.height <= 2560)
  assert.ok(output.width * output.height <= 4 * 1024 * 1024 + output.width)
  assert.ok(Math.abs(output.width / output.height - 1.2) < .001)
})

function pickerFixture() {
  let id, selection
  const api = {
    chooseImage: options => { assert.deepEqual(options.sizeType, ['original']); options.success({ tempFilePaths: ['_tmp/source.jpg'] }) },
    getImageInfo: options => options.success({ path: '_tmp/source.jpg', width: 1600, height: 1000, type: 'jpeg' }),
    navigateTo: options => { selection = options; id = new URL(options.url, 'https://app.local').searchParams.get('id') }
  }
  return { api, get id() { return id }, get navigation() { return selection } }
}

test('cover, illustration and export background all wait for manual crop confirmation', async () => {
  for (const [choose, title, ratio] of [[chooseBookCover, '裁切封面', .7], [chooseArticleImage, '裁切插图', undefined], [chooseBackgroundImage, '裁切背景图片', undefined]]) {
    const fixture = pickerFixture()
    let complete = false
    const choosing = choose(fixture.api).then(value => { complete = true; return value })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(complete, false)
    const request = getImageCropRequest(fixture.id)
    assert.equal(request.image.path, '_tmp/source.jpg')
    assert.equal(request.options.title, title)
    assert.equal(request.options.ratio, ratio)
    assert.ok(!fixture.navigation.url.includes('source.jpg'))
    finishImageCrop(fixture.id, { path: '_doc/cropped.png', width: 700, height: 1000 })
    const result = await choosing
    assert.equal(choose === chooseBookCover ? result : result.path, '_doc/cropped.png')
    assert.equal(getImageCropRequest(fixture.id), undefined)
  }
})

test('cancelling the crop and navigation failures release the picker lock and leave the previous selection untouched', async () => {
  const fixture = pickerFixture()
  const selecting = chooseArticleImage(fixture.api)
  await new Promise(resolve => setTimeout(resolve, 0))
  await assert.rejects(chooseBackgroundImage(fixture.api), /正在选择文件/)
  cancelImageCrop(fixture.id)
  await assert.rejects(selecting, /已取消选择/)
  assert.equal(finishImageCrop(fixture.id, { path: 'late' }), false)
  const failed = pickerFixture()
  failed.api.navigateTo = options => options.fail({})
  await assert.rejects(chooseBookCover(failed.api), /无法打开图片裁切界面/)
  await assert.rejects(chooseArticleImage({ chooseImage: options => options.fail({ errMsg: 'chooseImage:fail cancel' }) }), /已取消选择/)
})

test('cropped pixels and transparent areas are saved rather than the original photo', async t => {
  let createCanvas
  try { ({ createCanvas } = await import('@napi-rs/canvas')) } catch (_) { t.skip('Optional PDF canvas runtime is not installed'); return }
  const photo = createCanvas(100, 80), source = photo.getContext('2d')
  source.fillStyle = '#ff0000'; source.fillRect(0, 0, 50, 80)
  source.fillStyle = '#0000ff'; source.fillRect(50, 0, 50, 80)
  source.clearRect(50, 0, 20, 20)
  let output, context, saved, png
  const result = await createCroppedImage({ canvasId: 'crop', instance: 'page', image: { path: 'photo', width: 100, height: 80 }, crop: { x: 50, y: 0, width: 40, height: 60 },
    resize: size => { output = createCanvas(size.width, size.height); context = output.getContext('2d') }, nextFrame: async () => {},
    api: {
      createCanvasContext: () => ({ setGlobalAlpha: value => { context.globalAlpha = value }, drawImage: (_, ...args) => context.drawImage(photo, ...args), draw: (_, done) => done() }),
      canvasToTempFilePath: options => { assert.equal(options.width, 40); assert.equal(options.height, 60); png = output.toBuffer('image/png'); options.success({ tempFilePath: '_tmp/cropped.png' }) },
      saveFile: options => { saved = options.tempFilePath; options.success({ savedFilePath: '_doc/cropped.png' }) }
    } })
  assert.equal(saved, '_tmp/cropped.png')
  assert.deepEqual(result, { path: '_doc/cropped.png', width: 40, height: 60 })
  assert.deepEqual(Array.from(context.getImageData(5, 5, 1, 1).data), [0, 0, 0, 0])
  assert.deepEqual(Array.from(context.getImageData(30, 30, 1, 1).data), [0, 0, 255, 255])
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
})

test('invalid selections and save failures do not return a source photo as a successful crop', async () => {
  const options = { canvasId: 'crop', image: { path: 'photo', width: 100, height: 80 }, crop: { x: 80, y: 0, width: 50, height: 50 }, resize() {}, nextFrame: async () => {}, api: {} }
  await assert.rejects(createCroppedImage(options), /裁切区域无效/)
  options.crop = { x: 0, y: 0, width: 50, height: 50 }
  options.api = { createCanvasContext: () => ({ setGlobalAlpha() {}, drawImage() {}, draw: (_, done) => done() }), canvasToTempFilePath: value => value.success({ tempFilePath: 'cropped' }), saveFile: value => value.fail({}) }
  await assert.rejects(createCroppedImage(options), /裁切图片保存失败/)
})

const filename = 'pages/image-crop/index.vue', source = readFileSync(filename, 'utf8')
test('the actual crop-page gestures map display movement back to source pixels and cancellation releases its request', async () => {
  let id
  const result = requestImageCrop({ path: 'photo', width: 1600, height: 800 }, { ratio: 1 }, { navigateTo: options => { id = new URL(options.url, 'https://app.local').searchParams.get('id') } })
  let load, unload
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '')
  const context = { computed, ref, getCurrentInstance: () => ({ proxy: {} }), nextTick: async () => {}, onLoad: value => { load = value }, onReady() {}, onResize() {}, onBackPress() {}, onUnload: value => { unload = value }, t: key => key, centeredCrop, moveCrop, resizeCrop, fitImage, getImageCropRequest, cancelImageCrop, uni: {} }
  runInNewContext(script + '\nthis.page = { beginDrag, drag, finishDrag, viewport, measured, crop, chooseRatio }', context)
  load({ id })
  const page = context.page
  page.viewport.value = { width: 400, height: 400 }; page.measured.value = true
  page.beginDrag({ touches: [{ clientX: 100, clientY: 100 }] })
  page.drag({ touches: [{ clientX: 150, clientY: 100 }] })
  assert.equal(page.crop.value.x, 600)
  page.finishDrag()
  page.beginDrag({ touches: [{ clientX: 300, clientY: 300 }] }, 'se')
  page.drag({ touches: [{ clientX: 250, clientY: 250 }] })
  assert.equal(page.crop.value.width, 600)
  assert.equal(page.crop.value.height, 600)
  unload()
  await assert.rejects(result, /已取消选择/)
})

test('the crop UI compiles, its strings are translated, and the page is registered', () => {
  const { descriptor, errors } = parse(source, { filename })
  assert.deepEqual(errors, [])
  assert.doesNotThrow(() => compileScript(descriptor, { id: 'image-crop' }))
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: 'image-crop' }).errors, [])
  const paths = JSON.parse(readFileSync('pages.json', 'utf8')).pages.map(page => page.path)
  assert.ok(paths.includes('pages/image-crop/index'))
  const files = [source, readFileSync('src/services/image-crop.js', 'utf8'), readFileSync('src/services/covers.js', 'utf8'), readFileSync('src/services/article-images.js', 'utf8'), readFileSync('src/services/image-picker.js', 'utf8')]
  for (const text of files) {
    for (const match of text.matchAll(/\b(?:\$t|t)\('([^']+)'|title: '([^']+)'/g)) {
      const key = match[1] || match[2]
      for (const locale of ['en-US', 'ja-JP']) assert.ok(translations[locale][key], `${locale}: ${key}`)
    }
  }
})
