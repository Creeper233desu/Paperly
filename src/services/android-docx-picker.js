const REQUEST_CODE = 28462
const MAX_BYTES = 16 * 1024 * 1024
const CHUNK_BYTES = 1024 * 1024
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function displayName(resolver, uri) {
  let cursor
  try { cursor = plus.android.invoke(resolver, 'query', uri, null, null, null, null) }
  catch (_) { return '' }
  if (!cursor) return ''
  try {
    if (!plus.android.invoke(cursor, 'moveToFirst')) return ''
    const column = plus.android.invoke(cursor, 'getColumnIndex', '_display_name')
    return column >= 0 ? String(plus.android.invoke(cursor, 'getString', column) || '') : ''
  } finally { plus.android.invoke(cursor, 'close') }
}

function selectDocxUri() {
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return Promise.reject(new Error('请在 Android 应用中导入 DOCX'))
  return new Promise((resolve, reject) => {
    const activity = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
    intent.addCategory(Intent.CATEGORY_OPENABLE)
    intent.setType(DOCX_MIME)
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    const previous = activity.onActivityResult
    const finish = () => { activity.onActivityResult = previous }
    activity.onActivityResult = (code, resultCode, data) => {
      if (code !== REQUEST_CODE) { if (typeof previous === 'function') previous(code, resultCode, data); return }
      finish()
      if (resultCode !== -1 || !data) return reject(new Error('已取消选择'))
      const uri = plus.android.invoke(data, 'getData')
      if (!uri) return reject(new Error('无法读取选中的文档'))
      resolve({ activity, uri })
    }
    try { activity.startActivityForResult(intent, REQUEST_CODE) }
    catch (error) { finish(); reject(error) }
  })
}

async function copyToPrivateFile(activity, uri) {
  const resolver = activity.getContentResolver()
  const name = displayName(resolver, uri) || '导入的书籍.docx'
  if (!/\.docx$/i.test(name)) throw new Error('请选择 DOCX 文档')
  const File = plus.android.importClass('java.io.File')
  const FileInputStream = plus.android.importClass('java.io.FileInputStream')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const root = plus.io.convertLocalFileSystemURL('_doc/')
  if (!root) throw new Error('无法访问应用文档目录')
  const directory = new File(root, 'imports')
  if (!plus.android.invoke(directory, 'exists') && !plus.android.invoke(directory, 'mkdirs')) throw new Error('无法创建导入目录')
  const fileName = `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.docx`
  const target = new File(directory, fileName)
  const descriptor = plus.android.invoke(resolver, 'openFileDescriptor', uri, 'r')
  if (!descriptor) throw new Error('无法打开所选文档')
  let input, output, inputChannel, outputChannel, count = 0
  try {
    input = new FileInputStream(plus.android.invoke(descriptor, 'getFileDescriptor'))
    output = new FileOutputStream(target)
    inputChannel = plus.android.invoke(input, 'getChannel')
    outputChannel = plus.android.invoke(output, 'getChannel')
    if (!inputChannel || !outputChannel) throw new Error('无法建立文档复制通道')
    while (count <= MAX_BYTES) {
      const size = Number(plus.android.invoke(outputChannel, 'transferFrom', inputChannel, count, Math.min(CHUNK_BYTES, MAX_BYTES + 1 - count)))
      if (!Number.isFinite(size) || size < 0) throw new Error('读取 DOCX 文件失败')
      if (size === 0) break
      count += size
      if (count > MAX_BYTES) throw new Error('DOCX 文件不能超过 16 MB')
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
  if (!count || plus.android.invoke(target, 'length') !== count) { plus.android.invoke(target, 'delete'); throw new Error('文档复制不完整') }
  return { path: `_doc/imports/${fileName}`, name }
}

function readBytes(path) {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(path, entry => entry.file(file => {
      const reader = new plus.io.FileReader()
      reader.onloadend = event => {
        const result = String(event.target?.result || '')
        const encoded = result.slice(result.indexOf(',') + 1)
        if (!result.startsWith('data:') || !encoded) return reject(new Error('无法读取 DOCX 文件内容'))
        try { resolve(new Uint8Array(uni.base64ToArrayBuffer(encoded))) }
        catch (_) { reject(new Error('无法解码 DOCX 文件')) }
      }
      reader.onerror = () => reject(new Error('读取 DOCX 文件失败'))
      reader.readAsDataURL(file)
    }, () => reject(new Error('无法打开导入文档'))), () => reject(new Error('导入文档不存在')))
  })
}

export async function pickAndroidDocx() {
  const { activity, uri } = await selectDocxUri()
  const file = await copyToPrivateFile(activity, uri)
  try { return { name: file.name, bytes: await readBytes(file.path) } }
  finally { plus.io.resolveLocalFileSystemURL(file.path, entry => entry.remove(() => {}, () => {}), () => {}) }
}
