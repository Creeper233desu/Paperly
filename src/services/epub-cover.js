import { epubImageSource } from './epub.js'

export function saveEpubCover(epub) {
  const path = epub.coverPath
  const bytes = path && epub.resources[path]
  if (!bytes) return ''
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return epubImageSource(epub, path)
  const File = plus.android.importClass('java.io.File')
  const Output = plus.android.importClass('java.io.FileOutputStream')
  const Base64 = plus.android.importClass('android.util.Base64')
  const ByteBuffer = plus.android.importClass('java.nio.ByteBuffer')
  const root = plus.io.convertLocalFileSystemURL('_doc/')
  if (!root) throw new Error('无法保存 EPUB 封面')
  const folder = new File(root, 'reading-covers')
  if (!plus.android.invoke(folder, 'exists') && !plus.android.invoke(folder, 'mkdirs')) throw new Error('无法创建封面目录')
  const extension = path.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/)?.[1] || 'png'
  const fileName = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`
  const target = new File(folder, fileName)
  let output, channel
  try {
    const source = epubImageSource(epub, path)
    if (!source) throw new Error('EPUB 封面格式不受支持')
    const raw = plus.android.invoke(Base64, 'decode', source.slice(source.indexOf(',') + 1), 0)
    output = new Output(target)
    channel = plus.android.invoke(output, 'getChannel')
    if (!channel) throw new Error('无法建立封面写入通道')
    const buffer = plus.android.invoke(ByteBuffer, 'wrap', raw)
    while (plus.android.invoke(buffer, 'hasRemaining')) {
      if (Number(plus.android.invoke(channel, 'write', buffer)) <= 0) throw new Error('EPUB 封面写入失败')
    }
    plus.android.invoke(output, 'flush')
    if (Number(plus.android.invoke(target, 'length')) !== bytes.length) throw new Error('EPUB 封面保存不完整')
    return `_doc/reading-covers/${fileName}`
  } catch (error) { plus.android.invoke(target, 'delete'); throw error }
  finally { if (channel) plus.android.invoke(channel, 'close'); if (output) plus.android.invoke(output, 'close') }
}
