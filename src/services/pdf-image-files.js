import { removeImportedFile } from './android-pdf-picker.js'

export function removePdfImageFiles(paths, api = uni) {
  for (const path of new Set(paths || [])) if (path) api.removeSavedFile({ filePath: path, fail: () => removeImportedFile(path) })
}

export function pdfBookImagePaths(book) {
  return (book?.chapters || []).flatMap(chapter => (chapter.articles || []).flatMap(article => Object.values(article.images || {}).map(image => image.path)))
}
export function pdfDocumentImagePaths(document) {
  return (document?.pages || []).flatMap(page => page.filter(item => item.type === 'image').map(item => item.media.path))
}

export async function savePdfImage({ dataUrl, width, height }, api = uni) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl || '') || !(width > 0 && height > 0)) throw new Error('无法读取 PDF 图片')
  const id = `pdf-image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  const staging = `_doc/${id}.png`
  const bitmap = new plus.nativeObj.Bitmap(id)
  let savedPath = ''
  try {
    await new Promise((resolve, reject) => bitmap.loadBase64Data(dataUrl, resolve, reject))
    await new Promise((resolve, reject) => bitmap.save(staging, { overwrite: true, format: 'png' }, resolve, reject))
    const saved = await new Promise((resolve, reject) => api.saveFile({ tempFilePath: staging, success: resolve, fail: reject }))
    if (!saved.savedFilePath) throw new Error('PDF 图片保存失败')
    savedPath = saved.savedFilePath
    return { path: saved.savedFilePath, width, height }
  } catch (_) { throw new Error('PDF 图片保存失败，请检查存储空间') }
  finally { bitmap.clear(); if (savedPath !== staging) removeImportedFile(staging) }
}
