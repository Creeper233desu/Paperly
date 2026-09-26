import { preferences, loadPreferences, updatePreferences, fontFamilies } from '../store/preferences.js'

const REQUEST_CODE = 28461
const MAX_BYTES = 25 * 1024 * 1024
const COPY_CHUNK = 1024 * 1024
const bundled = {
  noto: { family: 'PaperNotoSerif', file: 'NotoSerifSC.ttf' },
  wenkai: { family: 'PaperWenKai', file: 'LXGWWenKaiLite-Regular.ttf' }
}

export function fontLabel(id) {
  const builtIn = { system: '系统默认', noto: '思源宋体', wenkai: '霞鹜文楷', sans: '系统无衬线', song: '系统衬线', kai: '系统楷体' }
  return builtIn[id] || loadPreferences().customFonts.find(item => item.id === id)?.name || '系统默认'
}

export function fontFamilyFor(id) {
  if (fontFamilies[id]) return fontFamilies[id]
  const font = loadPreferences().customFonts.find(item => item.id === id)
  return font ? `"PaperFont${font.id}", sans-serif` : fontFamilies.system
}

export function loadCustomFont(font) {
  if (!font) return Promise.resolve()
  // #ifdef APP-PLUS
  const absolute = plus.io.convertLocalFileSystemURL(font.path)
  if (!absolute) return Promise.reject(new Error('字体文件已丢失'))
  const family = `PaperFont${font.id}`
  const sources = [`url("${absolute.startsWith('file://') ? absolute : `file://${absolute}`}")`, `url("${absolute}")`, `url("${font.path}")`]
  return new Promise((resolve, reject) => {
    const attempt = index => uni.loadFontFace({
      family,
      source: sources[index],
      success: () => resolve(),
      fail: error => index + 1 < sources.length ? attempt(index + 1) : reject(new Error(error?.errMsg || '无法加载字体'))
    })
    attempt(0)
  })
  // #endif
  // #ifndef APP-PLUS
  return Promise.reject(new Error('自定义字体导入需要 Android App'))
  // #endif
}

export function loadBundledFont(id) {
  const item = bundled[id]
  if (!item) return Promise.resolve()
  const sources = [`url("/static/fonts/${item.file}")`]
  // #ifdef APP-PLUS
  const absolute = plus.io.convertLocalFileSystemURL(`_www/static/fonts/${item.file}`)
  if (absolute) sources.push(`url("file://${absolute}")`)
  // #endif
  return new Promise((resolve, reject) => {
    const attempt = index => uni.loadFontFace({
      family: item.family,
      source: sources[index],
      success: () => resolve(),
      fail: error => index + 1 < sources.length ? attempt(index + 1) : reject(new Error(error?.errMsg || '无法加载内置字体'))
    })
    attempt(0)
  })
}

export function loadSelectedFont() {
  loadPreferences()
  if (bundled[preferences.font]) return loadBundledFont(preferences.font)
  const font = preferences.customFonts.find(item => item.id === preferences.font)
  return font ? loadCustomFont(font) : Promise.resolve()
}

function readDisplayName(resolver, uri) {
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

async function copyFontFromUri(activity, uri) {
  const File = plus.android.importClass('java.io.File')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const Channels = plus.android.importClass('java.nio.channels.Channels')
  const resolver = activity.getContentResolver()
  const displayName = readDisplayName(resolver, uri)
  let mime = ''
  try { mime = String(plus.android.invoke(resolver, 'getType', uri) || '').toLowerCase() } catch (_) { /* rely on file name */ }
  const extension = displayName.toLowerCase().match(/\.(ttf|otf)$/)?.[1] || (mime.includes('opentype') || mime.includes('font-otf') ? 'otf' : mime.includes('truetype') || mime.includes('font-ttf') ? 'ttf' : '')
  if (!extension) throw new Error('请选择 TTF 或 OTF 字体文件')
  const name = displayName || `我的字体.${extension}`
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const base = plus.io.convertLocalFileSystemURL('_doc/')
  if (!base) throw new Error('无法访问应用字体目录')
  const directory = new File(base, 'fonts')
  if (!plus.android.invoke(directory, 'exists') && !plus.android.invoke(directory, 'mkdirs')) throw new Error('无法创建应用字体目录')
  const path = `_doc/fonts/${id}.${extension}`
  const target = new File(directory, `${id}.${extension}`)
  const input = plus.android.invoke(resolver, 'openInputStream', uri)
  if (!input) throw new Error('无法读取所选字体')
  let output, inputChannel, outputChannel
  let total = 0
  try {
    output = new FileOutputStream(target)
    inputChannel = plus.android.invoke(Channels, 'newChannel', input)
    outputChannel = plus.android.invoke(output, 'getChannel')
    if (!inputChannel || !outputChannel) throw new Error('无法建立字体复制通道')
    while (total <= MAX_BYTES) {
      const count = Number(plus.android.invoke(outputChannel, 'transferFrom', inputChannel, total, Math.min(COPY_CHUNK, MAX_BYTES + 1 - total)))
      if (!Number.isFinite(count) || count < 0) throw new Error('复制字体时读取失败')
      if (count === 0) break
      total += count
      if (total > MAX_BYTES) throw new Error('字体文件超过 25 MB，请选择较小的字体')
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    plus.android.invoke(output, 'flush')
  } catch (error) {
    plus.android.invoke(target, 'delete')
    throw error
  } finally {
    if (inputChannel) plus.android.invoke(inputChannel, 'close')
    else plus.android.invoke(input, 'close')
    if (outputChannel) plus.android.invoke(outputChannel, 'close')
    if (output) plus.android.invoke(output, 'close')
  }
  const size = plus.android.invoke(target, 'length')
  if (!total || size !== total) { plus.android.invoke(target, 'delete'); throw new Error(total ? '字体复制不完整，请重试' : '字体文件为空') }
  return { id, name: name.replace(/\.(ttf|otf)$/i, ''), path }
}

export function pickAndroidFont() {
  // #ifdef APP-PLUS
  if (plus.os.name !== 'Android') return Promise.reject(new Error('当前仅支持在 Android 导入字体'))
  return new Promise((resolve, reject) => {
    const activity = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
    intent.addCategory(Intent.CATEGORY_OPENABLE)
    intent.setType('*/*')
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    const previous = activity.onActivityResult
    let finished = false
    const done = () => { if (!finished) { finished = true; activity.onActivityResult = previous } }
    activity.onActivityResult = (requestCode, resultCode, data) => {
      if (requestCode !== REQUEST_CODE) {
        if (typeof previous === 'function') previous(requestCode, resultCode, data)
        return
      }
      done()
      if (resultCode !== -1 || !data) { reject(new Error('已取消选择')); return }
      const uri = plus.android.invoke(data, 'getData')
      if (!uri) { reject(new Error('无法获取所选字体文件')); return }
      setTimeout(() => copyFontFromUri(activity, uri).then(resolve, reject), 0)
    }
    try { activity.startActivityForResult(intent, REQUEST_CODE) }
    catch (error) { done(); reject(error) }
  })
  // #endif
  // #ifndef APP-PLUS
  return Promise.reject(new Error('请在 Android App 中导入字体'))
  // #endif
}

export async function importFont() {
  const font = await pickAndroidFont()
  try { await loadCustomFont(font) }
  catch (error) {
    // #ifdef APP-PLUS
    plus.io.resolveLocalFileSystemURL(font.path, entry => entry.remove(() => {}, () => {}), () => {})
    // #endif
    throw error
  }
  updatePreferences({ customFonts: [...loadPreferences().customFonts, font], font: font.id })
  return font
}

export function removeFont(id) {
  const font = loadPreferences().customFonts.find(item => item.id === id)
  if (!font) return
  updatePreferences({ customFonts: preferences.customFonts.filter(item => item.id !== id), font: preferences.font === id ? 'system' : preferences.font })
  // #ifdef APP-PLUS
  plus.io.resolveLocalFileSystemURL(font.path, entry => entry.remove(() => {}, () => {}), () => {})
  // #endif
}
