import { reactive } from 'vue'

const URI_KEY = 'paperwriter.dataTree.v1'
const DATA_KEYS = [
  'paperwriter.library.v1', 'paperwriter.statistics.v1', 'paperwriter.preferences.v1',
  'paperwriter.aiProfiles.v1', 'paperwriter.assistantSessions.v1'
]
const APP_FOLDER = 'PaperWriter'
const REQUEST_CODE = 28468
const MAX_COPY = 512 * 1024 * 1024

export const dataDirectory = reactive({ uri:'', label:'', busy:false, lastSync:'', error:'' })
let syncTimer = null, syncQueue = Promise.resolve(), syncSuspended = false

function androidReady() { return typeof plus !== 'undefined' && plus.os?.name === 'Android' }
function native() {
  const activity = plus.android.runtimeMainActivity()
  const resolver = activity.getContentResolver()
  const Contract = plus.android.importClass('android.provider.DocumentsContract')
  const Uri = plus.android.importClass('android.net.Uri')
  return { activity, resolver, Contract, Uri }
}
function invoke(object, method, ...args) { return plus.android.invoke(object, method, ...args) }
function uriText(uri) { return String(invoke(uri, 'toString')) }
function parseUri(value) { return invoke(plus.android.importClass('android.net.Uri'), 'parse', value) }
function documentUri(tree, id) { return invoke(plus.android.importClass('android.provider.DocumentsContract'), 'buildDocumentUriUsingTree', tree, id) }
function treeRoot(tree) {
  const id = invoke(plus.android.importClass('android.provider.DocumentsContract'), 'getTreeDocumentId', tree)
  return { id, uri:documentUri(tree, id) }
}
function listChildren(tree, parentId) {
  const { resolver, Contract } = native()
  const childUri = invoke(Contract, 'buildChildDocumentsUriUsingTree', tree, parentId)
  const cursor = invoke(resolver, 'query', childUri, null, null, null, null)
  if (!cursor) throw new Error('无法读取所选目录')
  const entries = []
  try {
    const nameColumn = invoke(cursor, 'getColumnIndex', '_display_name')
    const idColumn = invoke(cursor, 'getColumnIndex', 'document_id')
    const typeColumn = invoke(cursor, 'getColumnIndex', 'mime_type')
    while (invoke(cursor, 'moveToNext')) entries.push({
      name:String(invoke(cursor, 'getString', nameColumn) || ''),
      id:String(invoke(cursor, 'getString', idColumn) || ''),
      mime:String(invoke(cursor, 'getString', typeColumn) || '')
    })
  } finally { invoke(cursor, 'close') }
  return entries
}
function createChild(tree, parentId, name, mime) {
  const { resolver, Contract } = native()
  const created = invoke(Contract, 'createDocument', resolver, documentUri(tree, parentId), mime, name)
  if (!created) throw new Error(`无法创建 ${name}`)
  const id = invoke(Contract, 'getDocumentId', created)
  return { name, id:String(id), mime, uri:created }
}
function ensureChild(tree, parentId, name, mime) {
  const found = listChildren(tree, parentId).find(item => item.name === name)
  if (found) {
    if (found.mime !== mime) throw new Error(`${name} 已存在但不是所需的目录或文件`)
    return { ...found, uri:documentUri(tree, found.id) }
  }
  return createChild(tree, parentId, name, mime)
}
function dirs(uriString) {
  const tree = parseUri(uriString)
  const root = treeRoot(tree)
  const app = ensureChild(tree, root.id, APP_FOLDER, 'vnd.android.document/directory')
  const assets = ensureChild(tree, app.id, 'assets', 'vnd.android.document/directory')
  const exports = ensureChild(tree, app.id, 'exports', 'vnd.android.document/directory')
  return { tree, root, app, assets, exports }
}
function safeName(path) { return String(path).split(/[\\/]/).pop().replace(/[^\w.\-]/g, '_').slice(-70) || 'file' }
function assetName(path) {
  if (path.startsWith('_doc/recovered/')) return path.slice('_doc/recovered/'.length)
  let hash = 2166136261
  for (const char of path) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return `${(hash >>> 0).toString(36)}-${safeName(path)}`
}
function localFile(path) {
  const File = plus.android.importClass('java.io.File')
  const converted = plus.io.convertLocalFileSystemURL(path)
  return new File(converted || path.replace(/^file:\/\//, ''))
}
function localExists(path) { try { return !!invoke(localFile(path), 'isFile') } catch (_) { return false } }
function ensureLocalFolder(path) {
  const folder = localFile(path)
  if (!invoke(folder, 'exists') && !invoke(folder, 'mkdirs')) throw new Error('无法创建应用恢复目录')
  return folder
}
async function transfer(inputChannel, outputChannel, maxBytes = MAX_COPY) {
  let copied = 0
  while (copied <= maxBytes) {
    const count = Number(invoke(outputChannel, 'transferFrom', inputChannel, copied, Math.min(1024 * 1024, maxBytes + 1 - copied)))
    if (!Number.isFinite(count) || count < 0) throw new Error('数据文件复制失败')
    if (!count) break
    copied += count
    if (copied > maxBytes) throw new Error('单个数据文件超过 512 MB')
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return copied
}
async function copyLocalToDocument(path, uri) {
  const { resolver } = native()
  const FileInputStream = plus.android.importClass('java.io.FileInputStream')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  let source, descriptor, target, inputChannel, outputChannel
  try {
    source = new FileInputStream(localFile(path))
    inputChannel = invoke(source, 'getChannel')
    descriptor = invoke(resolver, 'openFileDescriptor', uri, 'w')
    if (!descriptor) throw new Error('无法写入所选目录')
    target = new FileOutputStream(invoke(descriptor, 'getFileDescriptor'))
    outputChannel = invoke(target, 'getChannel')
    const count = await transfer(inputChannel, outputChannel)
    invoke(target, 'flush')
    if (count !== Number(invoke(localFile(path), 'length'))) throw new Error('数据文件写入不完整')
  } finally {
    if (inputChannel) invoke(inputChannel, 'close')
    if (source) invoke(source, 'close')
    if (outputChannel) invoke(outputChannel, 'close')
    if (target) invoke(target, 'close')
    if (descriptor) invoke(descriptor, 'close')
  }
}
async function copyDocumentToLocal(uri, path) {
  const { resolver } = native()
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const Channels = plus.android.importClass('java.nio.channels.Channels')
  let source, target, inputChannel, outputChannel
  try {
    source = invoke(resolver, 'openInputStream', uri)
    if (!source) throw new Error('无法读取备份文件')
    inputChannel = invoke(Channels, 'newChannel', source)
    target = new FileOutputStream(localFile(path))
    outputChannel = invoke(target, 'getChannel')
    await transfer(inputChannel, outputChannel)
    invoke(target, 'flush')
  } finally {
    if (inputChannel) invoke(inputChannel, 'close')
    if (source) invoke(source, 'close')
    if (outputChannel) invoke(outputChannel, 'close')
    if (target) invoke(target, 'close')
  }
}
function writeLocalText(path, content) {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL('_doc/', root => root.getFile(safeName(path), { create:true }, entry => entry.createWriter(writer => {
      writer.onerror = () => reject(new Error('无法暂存数据索引'))
      writer.onwriteend = () => { writer.onwriteend = resolve; writer.write(content) }
      writer.truncate(0)
    }, reject), reject), reject)
  })
}
function readLocalText(path) {
  return new Promise((resolve, reject) => plus.io.resolveLocalFileSystemURL(path, entry => entry.file(file => {
    const reader = new plus.io.FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取数据索引'))
    reader.readAsText(file, 'UTF-8')
  }, reject), reject))
}
function walkValues(value, visit) {
  if (typeof value === 'string') return visit(value)
  if (Array.isArray(value)) return value.map(item => walkValues(item, visit))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walkValues(item, visit)]))
  return value
}
function snapshotValues() {
  const values = {}
  for (const key of DATA_KEYS) {
    const raw = uni.getStorageSync(key)
    if (raw) values[key] = typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  return values
}
function discoverAssets(values) {
  const paths = new Set()
  walkValues(values, value => {
    if ((value.startsWith('_doc/') || value.startsWith('file://') || value.startsWith('/storage/')) && localExists(value)) paths.add(value)
    return value
  })
  return [...paths].map(path => ({ path, name:assetName(path) }))
}
function latestSnapshot(tree, appId) {
  const entries = listChildren(tree, appId)
  const names = new Set(entries.map(item => item.name))
  return entries.filter(item => /^snapshot-\d+\.json$/.test(item.name) && names.has(item.name.replace(/\.json$/, '.ok'))).sort((a, b) => b.name.localeCompare(a.name))[0]
}
async function backupTo(uriString) {
  const { tree, app, assets } = dirs(uriString)
  const values = snapshotValues()
  const media = discoverAssets(values)
  const existing = new Map(listChildren(tree, assets.id).map(item => [item.name, item]))
  for (const item of media) if (!existing.has(item.name) || !existing.has(`${item.name}.ok`)) {
    if (existing.has(item.name) && !invoke(native().Contract, 'deleteDocument', native().resolver, documentUri(tree, existing.get(item.name).id))) throw new Error(`无法更新资源 ${item.name}`)
    const target = createChild(tree, assets.id, item.name, 'application/octet-stream')
    try { await copyLocalToDocument(item.path, target.uri) }
    catch (error) { invoke(native().Contract, 'deleteDocument', native().resolver, target.uri); throw error }
    if (!existing.has(`${item.name}.ok`)) createChild(tree, assets.id, `${item.name}.ok`, 'text/plain')
  }
  const mapping = new Map(media.map(item => [item.path, `asset:${item.name}`]))
  const snapshot = { version:1, createdAt:new Date().toISOString(), values:walkValues(values, value => mapping.get(value) || value), assets:media.map(item => item.name) }
  const staging = `_doc/paperwriter-snapshot.json`
  await writeLocalText(staging, JSON.stringify(snapshot))
  const stamp = Date.now()
  const target = createChild(tree, app.id, `snapshot-${stamp}.json`, 'application/json')
  try { await copyLocalToDocument(staging, target.uri) }
  catch (error) { invoke(native().Contract, 'deleteDocument', native().resolver, target.uri); throw error }
  createChild(tree, app.id, `snapshot-${stamp}.ok`, 'text/plain')
  const entries = listChildren(tree, app.id)
  const old = entries.filter(item => /^snapshot-\d+\.json$/.test(item.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(3)
  for (const entry of old) for (const file of [entry, entries.find(item => item.name === entry.name.replace(/\.json$/, '.ok'))].filter(Boolean)) {
    try { invoke(native().Contract, 'deleteDocument', native().resolver, documentUri(tree, file.id)) } catch (_) { /* keep older backup */ }
  }
  dataDirectory.lastSync = new Date().toLocaleString()
  dataDirectory.error = ''
}
async function restoreFrom(uriString) {
  const { tree, app, assets } = dirs(uriString)
  const latest = latestSnapshot(tree, app.id)
  if (!latest) return false
  ensureLocalFolder('_doc/recovered')
  await copyDocumentToLocal(documentUri(tree, latest.id), '_doc/recovered/snapshot.json')
  const snapshot = JSON.parse(await readLocalText('_doc/recovered/snapshot.json'))
  if (snapshot.version !== 1 || !snapshot.values || !Array.isArray(snapshot.assets)) throw new Error('备份格式无法识别')
  const available = new Map(listChildren(tree, assets.id).map(item => [item.name, item]))
  for (const name of snapshot.assets) {
    const file = available.get(name)
    if (!file || !available.has(`${name}.ok`)) throw new Error(`备份缺少资源 ${name}`)
    await copyDocumentToLocal(documentUri(tree, file.id), `_doc/recovered/${name}`)
  }
  const restored = walkValues(snapshot.values, value => value.startsWith('asset:') ? `_doc/recovered/${value.slice(6)}` : value)
  const previous = Object.fromEntries(DATA_KEYS.map(key => [key, uni.getStorageSync(key)]))
  syncSuspended = true
  try { for (const key of DATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(restored, key)) uni.setStorageSync(key, JSON.stringify(restored[key]))
    else uni.removeStorageSync(key)
  } } catch (error) {
    for (const key of DATA_KEYS) try {
      if (previous[key]) uni.setStorageSync(key, previous[key])
      else uni.removeStorageSync(key)
    } catch (_) { /* preserve original error */ }
    throw error
  } finally { syncSuspended = false }
  return true
}

export function initDataDirectory() {
  const value = uni.getStorageSync(URI_KEY)
  dataDirectory.uri = typeof value === 'string' ? value : ''
  dataDirectory.label = dataDirectory.uri ? decodeURIComponent(dataDirectory.uri.split('%3A').pop().split('/').pop()) : ''
  return dataDirectory
}
export function needsDataDirectory() {
  if (dataDirectory.uri) return false
  // #ifdef APP-PLUS
  if (androidReady()) return true
  try { return uni.getSystemInfoSync().platform === 'android' } catch (_) { return false }
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}
function pickTree() {
  return new Promise((resolve, reject) => {
    const { activity, resolver } = native()
    const Intent = plus.android.importClass('android.content.Intent')
    const intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    const previous = activity.onActivityResult
    const finish = () => { activity.onActivityResult = previous }
    activity.onActivityResult = (code, result, data) => {
      if (code !== REQUEST_CODE) { if (typeof previous === 'function') previous(code, result, data); return }
      finish()
      if (result !== -1 || !data) return reject(new Error('已取消选择目录'))
      const uri = invoke(data, 'getData')
      if (!uri) return reject(new Error('无法读取所选目录'))
      try {
        invoke(resolver, 'takePersistableUriPermission', uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        resolve(uriText(uri))
      } catch (error) { reject(new Error(`无法取得目录授权：${error.message || error}`)) }
    }
    try { activity.startActivityForResult(intent, REQUEST_CODE) } catch (error) { finish(); reject(error) }
  })
}
export async function chooseDataDirectory({ migrate = false } = {}) {
  if (!androidReady()) throw new Error('请在 Android 应用中选择数据目录')
  if (dataDirectory.busy) return false
  dataDirectory.busy = true; dataDirectory.error = ''
  try {
    clearTimeout(syncTimer)
    await syncQueue.catch(() => {})
    syncSuspended = true
    const chosen = await pickTree()
    if (chosen === dataDirectory.uri) return false
    const tree = parseUri(chosen), root = treeRoot(tree)
    const children = listChildren(tree, root.id)
    if (children.some(item => item.name !== APP_FOLDER) || children.length > 1) throw new Error('请选择空文件夹，或仅包含 PaperWriter 数据目录的文件夹')
    if (children.length && children[0].mime !== 'vnd.android.document/directory') throw new Error('PaperWriter 已存在但不是文件夹，请改选空目录')
    if (migrate && children.length) throw new Error('迁移目标请选空文件夹，避免覆盖已有备份')
    if (children.length) {
      const entries = listChildren(tree, children[0].id)
      if (entries.some(item => !['assets', 'exports'].includes(item.name) && !/^snapshot-\d+\.(json|ok)$/.test(item.name))) throw new Error('所选 PaperWriter 目录包含无法识别的文件，请改选空文件夹')
    }
    const existing = children.length === 1 && !!latestSnapshot(tree, children[0].id)
    if (existing && !migrate) {
      const localBooks = JSON.parse(uni.getStorageSync('paperwriter.library.v1') || '{"books":[]}').books || []
      if (localBooks.length) throw new Error('此目录已有备份。当前应用也有书籍，请选择空文件夹以避免覆盖。')
      await restoreFrom(chosen)
    } else await backupTo(chosen)
    uni.setStorageSync(URI_KEY, chosen)
    dataDirectory.uri = chosen
    dataDirectory.label = decodeURIComponent(chosen.split('%3A').pop().split('/').pop())
    return existing ? 'restored' : 'ready'
  } catch (error) { dataDirectory.error = error.message || String(error); throw error }
  finally { syncSuspended = false; dataDirectory.busy = false }
}
export function queueDirectorySync() {
  if (!androidReady() || !dataDirectory.uri || syncSuspended) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { flushDirectorySync().catch(error => { dataDirectory.error = error.message || String(error) }) }, 900)
}
export function flushDirectorySync() {
  clearTimeout(syncTimer)
  if (!androidReady() || !dataDirectory.uri || syncSuspended) return Promise.resolve()
  const target = dataDirectory.uri
  syncQueue = syncQueue.catch(() => {}).then(() => backupTo(target)).catch(error => { dataDirectory.error = error.message || String(error); throw error })
  return syncQueue
}
export async function mirrorExport(path, extension) {
  if (!androidReady() || !dataDirectory.uri) return ''
  const { tree, exports } = dirs(dataDirectory.uri)
  const name = `纸间-${Date.now()}.${extension.replace(/^\./, '')}`
  const mime = extension.toLowerCase() === 'pdf' ? 'application/pdf' : 'image/png'
  const target = createChild(tree, exports.id, name, mime)
  try { await copyLocalToDocument(path, target.uri); return uriText(target.uri) }
  catch (error) { invoke(native().Contract, 'deleteDocument', native().resolver, target.uri); throw error }
}
export async function deleteAllData() {
  if (!androidReady() || !dataDirectory.uri) throw new Error('尚未选择数据目录')
  clearTimeout(syncTimer)
  await syncQueue.catch(() => {})
  syncSuspended = true
  try {
    const tree = parseUri(dataDirectory.uri), root = treeRoot(tree)
    const app = listChildren(tree, root.id).find(item => item.name === APP_FOLDER)
    if (app && !invoke(native().Contract, 'deleteDocument', native().resolver, documentUri(tree, app.id))) throw new Error('无法删除原数据目录，未清除应用数据')
    for (const key of [...DATA_KEYS, 'paperwriter.imageExportDraft.v1']) uni.removeStorageSync(key)
    for (const folder of ['_doc/recovered', '_doc/fonts', '_doc/uniapp_save', '_doc/reading']) await new Promise(resolve => {
      plus.io.resolveLocalFileSystemURL(folder, entry => entry.removeRecursively(resolve, resolve), resolve)
    })
    dirs(dataDirectory.uri)
    dataDirectory.lastSync = ''
  } finally { syncSuspended = false }
}
