// Android PdfRenderer keeps the document in this app; only one page is opened
// and rasterized at a time to bound memory use for long books.
export function openPdfReader(path) {
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') throw new Error('请在 Android 应用中阅读 PDF')
  const absolute = plus.io.convertLocalFileSystemURL(path)
  if (!absolute) throw new Error('PDF 文件不存在')
  const File = plus.android.importClass('java.io.File')
  const Descriptor = plus.android.importClass('android.os.ParcelFileDescriptor')
  const PdfRenderer = plus.android.importClass('android.graphics.pdf.PdfRenderer')
  const Bitmap = plus.android.importClass('android.graphics.Bitmap')
  const Config = plus.android.importClass('android.graphics.Bitmap$Config')
  const CompressFormat = plus.android.importClass('android.graphics.Bitmap$CompressFormat')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const cacheRoot = plus.io.convertLocalFileSystemURL('_doc/')
  if (!cacheRoot) throw new Error('无法访问阅读缓存目录')
  const cacheFolder = new File(cacheRoot, 'reader-cache')
  if (!plus.android.invoke(cacheFolder, 'exists') && !plus.android.invoke(cacheFolder, 'mkdirs')) throw new Error('无法创建阅读缓存')
  const descriptor = plus.android.invoke(Descriptor, 'open', new File(absolute), 0x10000000)
  let renderer
  try { renderer = new PdfRenderer(descriptor) }
  catch (error) { plus.android.invoke(descriptor, 'close'); throw error }
  let closed = false
  let sequence = 0
  const cached = []
  const count = Number(plus.android.invoke(renderer, 'getPageCount'))
  return {
    count,
    async render(index, targetWidth = 1100) {
      if (closed || index < 0 || index >= count) throw new Error('阅读页码无效')
      const page = plus.android.invoke(renderer, 'openPage', index)
      let bitmap, output, target, fileName, rasterWidth, rasterHeight
      try {
        const width = Number(plus.android.invoke(page, 'getWidth'))
        const height = Number(plus.android.invoke(page, 'getHeight'))
        if (!width || !height) throw new Error('PDF 页面尺寸无效')
        rasterWidth = Math.min(1600, Math.max(480, Math.round(targetWidth)))
        rasterHeight = Math.max(1, Math.round(rasterWidth * height / width))
        bitmap = plus.android.invoke(Bitmap, 'createBitmap', rasterWidth, rasterHeight, Config.ARGB_8888)
        plus.android.invoke(bitmap, 'eraseColor', -1)
        plus.android.invoke(page, 'render', bitmap, null, null, 1)
        fileName = `page-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 7)}.jpg`
        target = new File(cacheFolder, fileName)
        output = new FileOutputStream(target)
        if (!plus.android.invoke(bitmap, 'compress', CompressFormat.JPEG, 88, output)) throw new Error('PDF 页面绘制失败')
        plus.android.invoke(output, 'flush')
        if (!Number(plus.android.invoke(target, 'length'))) throw new Error('PDF 页面保存失败')
      } catch (error) {
        if (target) plus.android.invoke(target, 'delete')
        throw error
      } finally {
        if (output) plus.android.invoke(output, 'close')
        if (bitmap) plus.android.invoke(bitmap, 'recycle')
        plus.android.invoke(page, 'close')
      }
      const localPath = `_doc/reader-cache/${fileName}`
      try {
        const urls = await new Promise((resolve, reject) => {
          plus.io.resolveLocalFileSystemURL(localPath, entry => {
            const remote = entry.toRemoteURL?.() || ''
            const local = entry.toLocalURL?.() || ''
            const finish = data => {
              const src = data || remote || local
              if (!src) return reject(new Error('无法获取 PDF 页面图片地址'))
              resolve({ src, fallbackSrc: data ? remote || local : remote ? local : '' })
            }
            if (!plus.io.FileReader) return finish('')
            entry.file(file => {
              const reader = new plus.io.FileReader()
              reader.onloadend = event => {
                const data = String(event.target?.result || reader.result || '')
                const encoded = data.match(/^data:[^,]*;base64,([\s\S]+)$/i)
                finish(encoded ? `data:image/jpeg;base64,${encoded[1]}` : '')
              }
              reader.onerror = () => finish('')
              try { reader.readAsDataURL(file) } catch (_) { finish('') }
            }, () => finish(''))
          }, () => reject(new Error('无法读取 PDF 页面图片')))
        })
        if (closed) throw new Error('阅读器已关闭')
        cached.push(target)
        return { ...urls, width: rasterWidth, height: rasterHeight }
      } catch (error) { plus.android.invoke(target, 'delete'); throw error }
    },
    close() {
      if (closed) return
      closed = true
      plus.android.invoke(renderer, 'close')
      plus.android.invoke(descriptor, 'close')
      cached.forEach(file => plus.android.invoke(file, 'delete'))
    }
  }
}
