import { pickAndroidImage } from './android-image-picker.js'
import { requestImageCrop } from './image-crop.js'

let choosing = false

function chooseAlbumImage(api) {
  return new Promise((resolve, reject) => api.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album'],
    success: picked => {
      const path = picked.tempFilePaths?.[0]
      if (path) resolve(path)
      else reject(new Error('没有选中图片'))
    },
    fail: error => reject(new Error(/cancel|取消/i.test(error?.errMsg || '') ? '已取消选择' : error?.errMsg || '无法读取图片'))
  }))
}

function removeTemporaryImage(path, savedPath) {
  try {
    const local = value => plus.io.convertLocalFileSystemURL(value) || value
    if (savedPath && local(path) === local(savedPath)) return
    plus.io.resolveLocalFileSystemURL(path, entry => entry.remove(() => {}, () => {}), () => {})
  } catch (_) { /* Cleanup must not turn a saved image into an upload failure. */ }
}

export async function chooseSavedImage(api = uni, saveError = '图片保存失败', options = {}) {
  if (choosing) throw new Error('正在选择文件')
  choosing = true
  const android = typeof plus !== 'undefined' && plus.os?.name === 'Android'
  let pickedPath = '', savedPath = ''
  try {
    pickedPath = android ? await pickAndroidImage() : await chooseAlbumImage(api)
    const info = await new Promise((resolve, reject) => api.getImageInfo({ src: pickedPath,
      success: resolve, fail: error => reject(new Error(error?.errMsg || '无法读取图片'))
    }))
    const width = Number(info.width), height = Number(info.height)
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('无法读取图片')
    const image = await requestImageCrop({ path: info.path || pickedPath, width, height, type: info.type || '' }, options, api)
    if (!image?.path) throw new Error(saveError)
    savedPath = image.path
    return image
  } finally {
    choosing = false
    // Persist through saveFile so existing removeSavedFile calls still work.
    // Native URI copies are only staging files, never durable image references.
    if (android && pickedPath) removeTemporaryImage(pickedPath, savedPath)
  }
}

export function chooseBackgroundImage(api = uni) {
  return chooseSavedImage(api, '图片保存失败', { title: '裁切背景图片' })
}
