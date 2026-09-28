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

async function copyReadableFile(activity, uri) {
  const resolver = activity.getContentResolver()
  const name = displayName(resolver, uri)
  const format = name.toLowerCase().match(/\.(pdf|epub)$/)?.[1]
  if (!format) throw new Error('请选择 PDF 或 EPUB 文件')
  const File = plus.android.importClass('java.io.File')
  const FileInputStream = plus.android.importClass('java.io.FileInputStream')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const root = plus.io.convertLocalFileSystemURL('_doc/')
  if (!root) throw new Error('无法访问应用文档目录')
  const folder = new File(root, 'reading')
  if (!plus.android.invoke(folder, 'exists') && !plus.android.invoke(folder, 'mkdirs')) throw new Error('无法创建阅读目录')
  const fileName = `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${format}`
  const target = new File(folder, fileName)
  const descriptor = plus.android.invoke(resolver, 'openFileDescriptor', uri, 'r')
  if (!descriptor) throw new Error('无法打开所选文件')
  let input, output, inputChannel, outputChannel, copied = 0
  try {
    input = new FileInputStream(plus.android.invoke(descriptor, 'getFileDescriptor'))
    output = new FileOutputStream(target)
    inputChannel = plus.android.invoke(input, 'getChannel')
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
    plus.android.invoke(descriptor, 'close')
  }
  if (!copied || Number(plus.android.invoke(target, 'length')) !== copied) { plus.android.invoke(target, 'delete'); throw new Error('文件复制不完整') }
  return { path: `_doc/reading/${fileName}`, name, format }
}
