const REQUEST_CODE = 28464
const MAX_BYTES = 80 * 1024 * 1024
const PHOTO_PICKER = 'android.provider.action.PICK_IMAGES'
const GET_CONTENT = 'android.intent.action.GET_CONTENT'
const OPEN_DOCUMENT = 'android.intent.action.OPEN_DOCUMENT'
let choosing = false

function invoke(object, method, ...args) { return plus.android.invoke(object, method, ...args) }

function selectImageUri() {
  return new Promise((resolve, reject) => {
    const activity = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const previous = activity.onActivityResult
    let finished = false
    const finish = () => {
      finished = true
      if (activity.onActivityResult === onResult) activity.onActivityResult = previous
    }
    const onResult = (code, resultCode, data) => {
      if (Number(code) !== REQUEST_CODE) {
        if (typeof previous === 'function') previous(code, resultCode, data)
        return
      }
      if (finished) return
      finish()
      if (Number(resultCode) !== -1 || !data) return reject(new Error('已取消选择'))
      try {
        const uri = invoke(data, 'getData')
        if (!uri) return reject(new Error('没有选中图片'))
        resolve({ activity, uri })
      } catch (_) { reject(new Error('无法读取图片')) }
    }
    activity.onActivityResult = onResult
    // Use action strings so Native.js also works on older Android versions.
    // GET_CONTENT lets older vendor ROMs supply their own secure gallery.
    // Only launch failures fall back; cancelling never opens a second picker.
    for (const action of [PHOTO_PICKER, GET_CONTENT, OPEN_DOCUMENT]) {
      try {
        const intent = new Intent(action)
        invoke(intent, 'setType', 'image/*')
        invoke(intent, 'addFlags', 1) // FLAG_GRANT_READ_URI_PERMISSION
        if (action !== PHOTO_PICKER) invoke(intent, 'addCategory', 'android.intent.category.OPENABLE')
        activity.startActivityForResult(intent, REQUEST_CODE)
        return
      } catch (_) { /* Try the next system picker without requesting album access. */ }
    }
    finish()
    reject(new Error('无法打开系统图片选择器'))
  })
}

function imageExtension(resolver, uri) {
  let mime = ''
  try { mime = String(invoke(resolver, 'getType', uri) || '').toLowerCase() } catch (_) { /* Inspect the copied image later. */ }
  if (mime && !mime.startsWith('image/')) throw new Error('没有选中图片')
  const formats = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif',
    'image/bmp':'bmp', 'image/heic':'heic', 'image/heif':'heif', 'image/avif':'avif' }
  // getImageInfo validates the content before it can become a saved image.
  return formats[mime] || 'img'
}

async function copyImage(activity, uri) {
  const resolver = activity.getContentResolver()
  const extension = imageExtension(resolver, uri)
  const File = plus.android.importClass('java.io.File')
  const FileInputStream = plus.android.importClass('java.io.FileInputStream')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const Channels = plus.android.importClass('java.nio.channels.Channels')
  const root = plus.io.convertLocalFileSystemURL('_doc/')
  if (!root) throw new Error('图片保存失败')
  const folder = new File(root, 'image-picker')
  if (!invoke(folder, 'exists') && !invoke(folder, 'mkdirs')) throw new Error('图片保存失败')
  const fileName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`
  const target = new File(folder, fileName)
  let descriptor, input, output, inputChannel, outputChannel, copied = 0, complete = false
  try {
    // Content URIs, including cloud photos, may expose a stream or a descriptor.
    try {
      input = invoke(resolver, 'openInputStream', uri)
      if (input) inputChannel = invoke(Channels, 'newChannel', input)
    } catch (_) { /* Try a file descriptor below. */ }
    if (!inputChannel) {
      if (input) { invoke(input, 'close'); input = null }
      descriptor = invoke(resolver, 'openFileDescriptor', uri, 'r')
      if (!descriptor) throw new Error('无法读取图片')
      input = new FileInputStream(invoke(descriptor, 'getFileDescriptor'))
      inputChannel = invoke(input, 'getChannel')
    }
    output = new FileOutputStream(target)
    outputChannel = invoke(output, 'getChannel')
    if (!inputChannel || !outputChannel) throw new Error('无法读取图片')
    while (copied <= MAX_BYTES) {
      const count = Number(invoke(outputChannel, 'transferFrom', inputChannel, copied, Math.min(1024 * 1024, MAX_BYTES + 1 - copied)))
      if (!Number.isFinite(count) || count < 0) throw new Error('无法读取图片')
      if (!count) break
      copied += count
      if (copied > MAX_BYTES) throw new Error('图片不能超过 80 MB')
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    invoke(output, 'flush')
    if (!copied || Number(invoke(target, 'length')) !== copied) throw new Error('无法读取图片')
    complete = true
    return `_doc/image-picker/${fileName}`
  } finally {
    for (const resource of [inputChannel, input, outputChannel, output, descriptor]) {
      if (resource) { try { invoke(resource, 'close') } catch (_) { /* Close remaining resources too. */ } }
    }
    if (!complete) { try { invoke(target, 'delete') } catch (_) { /* Preserve the original read error. */ } }
  }
}

export async function pickAndroidImage() {
  if (choosing) throw new Error('正在选择文件')
  choosing = true
  try {
    const { activity, uri } = await selectImageUri()
    return await copyImage(activity, uri)
  } finally { choosing = false }
}
