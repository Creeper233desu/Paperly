import { pickAndroidImage } from './android-image-picker.js'

function chooseAlbumImage(api) {
  return new Promise((resolve, reject) => api.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album'],
    success: picked => {
      const path = picked.tempFilePaths?.[0]
      if (path) resolve(path)
      else reject(new Error('没有选中图片'))
    },
    fail: error => reject(new Error(error?.errMsg || '已取消选择'))
  }))
}

function compressImage(api, path) {
  return new Promise(resolve => api.compressImage({ src: path, quality: 80,
    success: result => resolve(result.tempFilePath || path),
    fail: () => resolve(path) // Preserve formats that the compressor cannot handle.
  }))
}

function removeTemporaryImage(path, savedPath) {
  try {
    const local = value => plus.io.convertLocalFileSystemURL(value) || value
    if (savedPath && local(path) === local(savedPath)) return
    plus.io.resolveLocalFileSystemURL(path, entry => entry.remove(() => {}, () => {}), () => {})
  } catch (_) { /* Cleanup must not turn a saved image into an upload failure. */ }
}

export async function chooseSavedImage(api = uni, saveError = '图片保存失败') {
  const android = typeof plus !== 'undefined' && plus.os?.name === 'Android'
  const pickedPath = android ? await pickAndroidImage() : await chooseAlbumImage(api)
  let path = pickedPath, savedPath = ''
  try {
    if (android) path = await compressImage(api, pickedPath)
    const info = await new Promise((resolve, reject) => api.getImageInfo({ src: path,
      success: resolve, fail: error => reject(new Error(error?.errMsg || '无法读取图片'))
    }))
    const saved = await new Promise((resolve, reject) => api.saveFile({ tempFilePath: path,
      success: resolve, fail: error => reject(new Error(error?.errMsg || saveError))
    }))
    if (!saved.savedFilePath) throw new Error(saveError)
    savedPath = saved.savedFilePath
    return { path: savedPath, width: info.width || 0, height: info.height || 0 }
  } finally {
    // Persist through saveFile so existing removeSavedFile calls still work.
    // Native URI copies are only staging files, never durable image references.
    if (android) {
      removeTemporaryImage(pickedPath, savedPath)
      if (path !== pickedPath) removeTemporaryImage(path, savedPath)
    }
  }
}
