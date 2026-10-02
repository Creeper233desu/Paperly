import { cropOutputSize } from '../utils/image-crop.js'

const requests = new Map()
let sequence = 0

// Only a request ID travels in the URL. The image stays in this process until
// the crop page confirms or unloads; no source photo is stored in preferences.
export function requestImageCrop(image, options = {}, api = uni) {
  const id = `crop-${Date.now()}-${++sequence}`
  return new Promise((resolve, reject) => {
    requests.set(id, { image, options, resolve, reject })
    const fail = () => cancelImageCrop(id, new Error('无法打开图片裁切界面'))
    try { api.navigateTo({ url: `/pages/image-crop/index?id=${encodeURIComponent(id)}`, fail }) }
    catch (_) { fail() }
  })
}

export function getImageCropRequest(id) { return requests.get(id) }
export function finishImageCrop(id, image) {
  const request = requests.get(id)
  if (!request) return false
  requests.delete(id); request.resolve(image)
  return true
}
export function cancelImageCrop(id, error = new Error('已取消选择')) {
  const request = requests.get(id)
  if (!request) return
  requests.delete(id); request.reject(error)
}

function callbackOperation(start, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), 8000)
    const success = result => { clearTimeout(timeout); resolve(result) }
    const fail = () => { clearTimeout(timeout); reject(new Error(message)) }
    try { start(success, fail) } catch (_) { fail() }
  })
}

export async function saveCropImage(path, size, api = uni) {
  const result = await callbackOperation((success, fail) => api.saveFile({ tempFilePath: path, success, fail }), '裁切图片保存失败，请检查存储空间')
  if (!result.savedFilePath) throw new Error('裁切图片保存失败，请检查存储空间')
  return { path: result.savedFilePath, ...size }
}

export async function createCroppedImage({ canvasId, instance, image, crop, maxEdge = 2560, resize, nextFrame, api = uni }) {
  if (!image?.path || ![image.width, image.height, crop?.x, crop?.y, crop?.width, crop?.height].every(Number.isFinite)
    || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
    || crop.x + crop.width > image.width + .01 || crop.y + crop.height > image.height + .01) throw new Error('裁切区域无效，请重新框选')
  const size = cropOutputSize(crop, maxEdge)
  resize(size)
  await nextFrame()
  const ctx = api.createCanvasContext(canvasId, instance)
  if (!ctx) throw new Error('无法建立图片画布')
  ctx.setGlobalAlpha(1)
  ctx.drawImage(image.path, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
  await callbackOperation(success => ctx.draw(false, success), '裁切图片绘制失败，请重试')
  const result = await callbackOperation((success, fail) => api.canvasToTempFilePath({
    canvasId, fileType: 'png', width: size.width, height: size.height,
    destWidth: size.width, destHeight: size.height, success, fail
  }, instance), '裁切图片生成失败，请重试')
  if (!result.tempFilePath) throw new Error('裁切图片生成失败，请重试')
  return saveCropImage(result.tempFilePath, size, api)
}
