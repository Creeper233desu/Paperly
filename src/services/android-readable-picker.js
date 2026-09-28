const REQUEST_CODE = 28463
const MAX_BYTES = 80 * 1024 * 1024

function displayName(resolver, uri) {
  let cursor
  try { cursor = plus.android.invoke(resolver, 'query', uri, null, null, null, null) } catch (_) { return '' }
  if (!cursor) return ''
  try {
    if (!plus.android.invoke(cursor, 'moveToFirst')) return ''
    const column = plus.android.invoke(cursor, 'getColumnIndex', '_display_name')
    return column >= 0 ? String(plus.android.invoke(cursor, 'getString', column) || '') : ''
  } finally { plus.android.invoke(cursor, 'close') }
}

export function pickReadableBook() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return Promise.reject(new Error('请在 Android 应用中导入 PDF 或 EPUB'))
  return new Promise((resolve, reject) => {
    const activity = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
    intent.addCategory(Intent.CATEGORY_OPENABLE)
    intent.setType('*/*')
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    const previous = activity.onActivityResult
    const finish = () => { activity.onActivityResult = previous }
    activity.onActivityResult = (code, resultCode, data) => {
      if (code !== REQUEST_CODE) { if (typeof previous === 'function') previous(code, resultCode, data); return }
      finish()
      if (resultCode !== -1 || !data) return reject(new Error('已取消选择'))
      const uri = plus.android.invoke(data, 'getData')
      if (!uri) return reject(new Error('无法读取所选文件'))
      setTimeout(() => copyReadableFile(activity, uri).then(resolve, reject), 0)
    }
    try { activity.startActivityForResult(intent, REQUEST_CODE) } catch (error) { finish(); reject(error) }
  })
  // #endif
  // #ifndef APP-PLUS
  return Promise.reject(new Error('请在 Android 应用中导入文件'))
  // #endif
}

export function readEpubBytes(path) {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(path, entry => entry.file(file => {
      if (file.size > 32 * 1024 * 1024) return reject(new Error('EPUB 文件不能超过 32 MB'))
      const reader = new plus.io.FileReader()
      reader.onloadend = event => {
        const data = String(event.target?.result || '')
        if (!data.startsWith('data:') || !data.includes(',')) return reject(new Error('无法读取 EPUB 文件'))
        try { resolve(new Uint8Array(uni.base64ToArrayBuffer(data.slice(data.indexOf(',') + 1)))) }
        catch (_) { reject(new Error('EPUB 文件解码失败')) }
      }
      reader.onerror = () => reject(new Error('无法读取 EPUB 文件'))
      reader.readAsDataURL(file)
    }, () => reject(new Error('无法打开 EPUB 文件'))), () => reject(new Error('EPUB 文件不存在')))
  })
}

async function copyReadableFile(activity, uri) {
  const resolver = activity.getContentResolver()
  const foundName = displayName(resolver, uri)
  let mime = ''
  try { mime = String(plus.android.invoke(resolver, 'getType', uri) || '') } catch (_) { /* filename is enough */ }
  const fallbackFormat = mime === 'application/pdf' ? 'pdf' : mime === 'application/epub+zip' ? 'epub' : ''
  const name = foundName || (fallbackFormat ? `导入的书籍.${fallbackFormat}` : '')
  const format = name.toLowerCase().match(/\.(pdf|epub)$/)?.[1]
  if (!format) throw new Error('请选择 PDF 或 EPUB 文件')
  const File = plus.android.importClass('java.io.File')
  const FileInputStream = plus.android.importClass('java.io.FileInputStream')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const Channels = plus.android.importClass('java.nio.channels.Channels')
  const root = plus.io.convertLocalFileSystemURL('_doc/')
  if (!root) throw new Error('无法访问应用文档目录')
  const folder = new File(root, 'reading')
  if (!plus.android.invoke(folder, 'exists') && !plus.android.invoke(folder, 'mkdirs')) throw new Error('无法创建阅读目录')
  const fileName = `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${format}`
  const target = new File(folder, fileName)
  let descriptor, input, output, inputChannel, outputChannel, copied = 0
  try {
    try {
      input = plus.android.invoke(resolver, 'openInputStream', uri)
      if (input) inputChannel = plus.android.invoke(Channels, 'newChannel', input)
    } catch (_) { /* Some providers only expose a descriptor. */ }
    if (!inputChannel) {
      if (input) plus.android.invoke(input, 'close')
      descriptor = plus.android.invoke(resolver, 'openFileDescriptor', uri, 'r')
      if (!descriptor) throw new Error('无法打开所选文件')
      input = new FileInputStream(plus.android.invoke(descriptor, 'getFileDescriptor'))
      inputChannel = plus.android.invoke(input, 'getChannel')
    }
    output = new FileOutputStream(target)
    outputChannel = plus.android.invoke(output, 'getChannel')
    if (!inputChannel || !outputChannel) throw new Error('无法建立文件复制通道')
    while (copied <= MAX_BYTES) {
      const count = Number(plus.android.invoke(outputChannel, 'transferFrom', inputChannel, copied, Math.min(1024 * 1024, MAX_BYTES + 1 - copied)))
      if (!Number.isFinite(count) || count < 0) throw new Error('文件复制失败')
      if (!count) break
      copied += count
      if (copied > MAX_BYTES) throw new Error('文件不能超过 80 MB')
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    plus.android.invoke(output, 'flush')
  } catch (error) { plus.android.invoke(target, 'delete'); throw error }
  finally {
    if (inputChannel) plus.android.invoke(inputChannel, 'close')
    if (input) plus.android.invoke(input, 'close')
    if (outputChannel) plus.android.invoke(outputChannel, 'close')
    if (output) plus.android.invoke(output, 'close')
    if (descriptor) plus.android.invoke(descriptor, 'close')
  }
  if (!copied || Number(plus.android.invoke(target, 'length')) !== copied) { plus.android.invoke(target, 'delete'); throw new Error('文件复制不完整') }
  return { path: `_doc/reading/${fileName}`, name, format }
}
