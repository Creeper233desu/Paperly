import { reactive } from 'vue'

const DATA_KEYS = [
  'paperwriter.library.v1', 'paperwriter.statistics.v1', 'paperwriter.preferences.v1',
  'paperwriter.aiProfiles.v1', 'paperwriter.assistantSessions.v1'
]
const APP_FOLDER = 'PaperWriter'
const MAX_COPY = 512 * 1024 * 1024

// Documents/PaperWriter is shared storage, so it survives an uninstall. The old
// SAF tree URI was stored inside the app and could never survive reinstalling.
export const dataDirectory = reactive({ uri:'', label:'Documents/PaperWriter', ready:false, busy:false, permission:'unknown', lastSync:'', error:'' })
let syncTimer = null, syncQueue = Promise.resolve(), syncSuspended = false, connecting = null
const scannedAssetFolders = new Set()

function androidReady() { return typeof plus !== 'undefined' && plus.os?.name === 'Android' }
function invoke(object, method, ...args) { return plus.android.invoke(object, method, ...args) }
function androidClass(name) { return plus.android.importClass(name) }
function sdkVersion() {
  const build = androidClass('android.os.Build')
  return Number(build?.VERSION?.SDK_INT || androidClass('android.os.Build$VERSION').SDK_INT || 0)
}
function localFile(path) {
  const File = androidClass('java.io.File')
  const converted = plus.io.convertLocalFileSystemURL(path)
  return new File(converted || String(path).replace(/^file:\/\//, ''))
}
function child(parent, name) { return new (androidClass('java.io.File'))(parent, name) }
function absolute(file) { return String(invoke(file, 'getAbsolutePath')) }
function documentRoot() {
  const Environment = androidClass('android.os.Environment')
  const File = androidClass('java.io.File')
  const attempt = (object, method, ...args) => {
    try { return object ? invoke(object, method, ...args) : null }
    catch (_) { return null }
  }
  // Native.js does not always expose DIRECTORY_DOCUMENTS as a class field.
  let documents = attempt(Environment, 'getExternalStoragePublicDirectory', 'Documents')
  if (!documents) {
    const externalRoot = attempt(Environment, 'getExternalStorageDirectory')
    if (externalRoot) documents = child(externalRoot, 'Documents')
  }
  if (!documents) {
    const activity = plus.android.runtimeMainActivity()
    const appFiles = attempt(activity, 'getExternalFilesDir', null)
    const appCache = appFiles ? null : attempt(activity, 'getExternalCacheDir')
    const appPath = appFiles || appCache || plus.io.convertLocalFileSystemURL('_doc/')
    const path = appPath && (typeof appPath === 'string' ? appPath : absolute(appPath))
    const normalized = String(path || '').replace(/^file:\/\//, '').replace(/\\/g, '/')
    const marker = '/Android/data/'
    const markerAt = normalized.indexOf(marker)
    if (markerAt > 0) documents = child(new File(normalized.slice(0, markerAt)), 'Documents')
  }
  if (!documents) throw new Error('无法定位系统 Documents 目录')
  return child(documents, APP_FOLDER)
}
function targetSdkVersion() {
  const info = invoke(plus.android.runtimeMainActivity(), 'getApplicationInfo')
  androidClass(info)
  return Number(info.targetSdkVersion || 0)
}
function legacyStorageAccess() {
  const activity = plus.android.runtimeMainActivity()
  if (targetSdkVersion() > 29) return false
  if (sdkVersion() >= 23 && Number(invoke(activity, 'checkSelfPermission', 'android.permission.WRITE_EXTERNAL_STORAGE')) !== 0) return false
  const documents = invoke(documentRoot(), 'getParentFile')
  const folder = invoke(documents, 'exists') ? documents : invoke(documents, 'getParentFile')
  if (!invoke(folder, 'canRead') || !invoke(folder, 'canWrite')) return false
  const probe = child(folder, `.paperwriter-access-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  try { return !!invoke(probe, 'createNewFile') }
  catch (_) { return false }
  finally { try { if (invoke(probe, 'exists')) invoke(probe, 'delete') } catch (_) { /* permission is checked again before IO */ } }
}
function hasPermission() {
  if (!androidReady()) return false
  if (sdkVersion() >= 30) {
    try { if (invoke(androidClass('android.os.Environment'), 'isExternalStorageManager')) return true } catch (_) { /* test direct legacy access */ }
    return legacyStorageAccess()
  }
  if (sdkVersion() < 23) return true
  return Number(invoke(plus.android.runtimeMainActivity(), 'checkSelfPermission', 'android.permission.WRITE_EXTERNAL_STORAGE')) === 0
}
function ensureFolder(folder) {
  if (!invoke(folder, 'exists') && !invoke(folder, 'mkdirs')) throw new Error(`无法创建数据目录：${absolute(folder)}`)
  if (!invoke(folder, 'isDirectory')) throw new Error(`数据目录被同名文件占用：${absolute(folder)}`)
  return folder
}
function names(folder) {
  const values = invoke(folder, 'list')
  if (values == null) throw new Error(`无法读取数据目录：${absolute(folder)}`)
  return Array.from(values)
}
function isFile(file) { return !!invoke(file, 'isFile') }
function deleteFile(file) { if (invoke(file, 'exists') && !invoke(file, 'delete')) throw new Error(`无法删除文件：${absolute(file)}`) }
function removeTree(folder) {
  if (!invoke(folder, 'exists')) return
  if (invoke(folder, 'isDirectory')) for (const name of names(folder)) removeTree(child(folder, name))
  deleteFile(folder)
}
function createMarker(file) { if (!invoke(file, 'createNewFile') && !isFile(file)) throw new Error('无法完成数据写入标记') }
function renameFile(from, to) { if (!invoke(from, 'renameTo', to)) throw new Error('无法提交数据文件') }

function assetFolder(root) {
  const folder = ensureFolder(child(root, 'assets'))
  const marker = child(folder, '.nomedia')
  const created = !isFile(marker)
  // Keep shared backups restorable after uninstall without publishing their
  // covers/illustrations to Gallery. Exports remain outside this directory.
  createMarker(marker)
  const path = absolute(marker)
  if (created) scannedAssetFolders.delete(path)
  if (!scannedAssetFolders.has(path)) {
    try {
      // Scanning .nomedia also refreshes existing indexed files in its parent;
      // do not delete MediaStore rows, which can delete the actual backups.
      invoke(androidClass('android.media.MediaScannerConnection'), 'scanFile', plus.android.runtimeMainActivity(), [path], null, null)
      scannedAssetFolders.add(path)
    } catch (_) { /* Some ROMs refresh their gallery on the next system scan. */ }
  }
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
async function copyFile(source, target) {
  const FileInputStream = androidClass('java.io.FileInputStream')
  const FileOutputStream = androidClass('java.io.FileOutputStream')
  let input, output, inputChannel, outputChannel
  try {
    input = new FileInputStream(source)
    output = new FileOutputStream(target)
    inputChannel = invoke(input, 'getChannel')
    outputChannel = invoke(output, 'getChannel')
    const copied = await transfer(inputChannel, outputChannel)
    if (copied !== Number(invoke(source, 'length'))) throw new Error('数据文件写入不完整')
    invoke(output, 'flush')
  } finally {
    if (inputChannel) invoke(inputChannel, 'close')
    if (outputChannel) invoke(outputChannel, 'close')
    if (input) invoke(input, 'close')
    if (output) invoke(output, 'close')
  }
}
async function atomicCopy(source, target) {
  const temporary = child(invoke(target, 'getParentFile'), `${invoke(target, 'getName')}.tmp`)
  deleteFile(temporary)
  try {
    await copyFile(source, temporary)
    renameFile(temporary, target)
  } catch (error) { try { deleteFile(temporary) } catch (_) { /* preserve original error */ } throw error }
}
function safeName(path) { return String(path).split(/[\\/]/).pop().replace(/[^\w.\-]/g, '_').slice(-70) || 'file' }
function assetName(path) {
  if (path.startsWith('_doc/recovered/')) return path.slice('_doc/recovered/'.length)
  let hash = 2166136261
  for (const char of path) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return `${(hash >>> 0).toString(36)}-${safeName(path)}`
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
    if ((value.startsWith('_doc/') || value.startsWith('file://') || value.startsWith('/storage/')) && isFile(localFile(value))) paths.add(value)
    return value
  })
  return [...paths].map(path => ({ path, name:assetName(path) }))
}
function completedSnapshots(root) {
  const found = new Set(names(root))
  return [...found].filter(name => /^snapshot-\d+\.json$/.test(name) && found.has(name.replace(/\.json$/, '.ok'))).sort().reverse().map(name => child(root, name))
}
async function backupTo(root) {
  ensureFolder(root)
  const assets = assetFolder(root)
  ensureFolder(child(root, 'exports'))
  const values = snapshotValues()
  const media = discoverAssets(values)
  for (const item of media) {
    const target = child(assets, item.name)
    const marker = child(assets, `${item.name}.ok`)
    if (isFile(target) && isFile(marker)) continue
    deleteFile(marker)
    deleteFile(target)
    await atomicCopy(localFile(item.path), target)
    createMarker(marker)
  }
  const mapping = new Map(media.map(item => [item.path, `asset:${item.name}`]))
  const snapshot = { version:1, createdAt:new Date().toISOString(), values:walkValues(values, value => mapping.get(value) || value), assets:media.map(item => item.name) }
  const staging = '_doc/paperwriter-snapshot.json'
  await writeLocalText(staging, JSON.stringify(snapshot))
  const stamp = Date.now()
  const target = child(root, `snapshot-${stamp}.json`)
  await atomicCopy(localFile(staging), target)
  createMarker(child(root, `snapshot-${stamp}.ok`))
  const files = new Set(names(root))
  const snapshots = [...files].filter(name => /^snapshot-\d+\.json$/.test(name) && files.has(name.replace(/\.json$/, '.ok'))).sort().reverse()
  for (const name of snapshots.slice(3)) {
    deleteFile(child(root, name))
    deleteFile(child(root, name.replace(/\.json$/, '.ok')))
  }
  dataDirectory.lastSync = new Date().toISOString()
  dataDirectory.error = ''
}
async function restoreFrom(root) {
  const candidates = completedSnapshots(root)
  if (!candidates.length) return false
  ensureFolder(localFile('_doc/recovered'))
  let lastError
  for (const candidate of candidates) {
    try {
      await restoreSnapshot(root, candidate)
      return true
    } catch (error) { lastError = error }
  }
  throw new Error(`无法恢复数据：所有已完成的备份均不可用（${lastError?.message || '未知错误'}）`)
}
async function restoreSnapshot(root, candidate) {
  await copyFile(candidate, localFile('_doc/recovered/snapshot.json'))
  const snapshot = JSON.parse(await readLocalText('_doc/recovered/snapshot.json'))
  if (snapshot.version !== 1 || !snapshot.values || !Array.isArray(snapshot.assets)) throw new Error('备份格式无法识别')
  const assets = assetFolder(root)
  for (const name of snapshot.assets) {
    if (!/^[\w.\-]+$/.test(name) || name === '.' || name === '..') throw new Error('备份资源名称不安全')
    const file = child(assets, name)
    if (!isFile(file) || !isFile(child(assets, `${name}.ok`))) throw new Error(`备份缺少资源 ${name}`)
    await copyFile(file, localFile(`_doc/recovered/${name}`))
  }
  const restored = walkValues(snapshot.values, value => value.startsWith('asset:') ? `_doc/recovered/${value.slice(6)}` : value)
  const previous = Object.fromEntries(DATA_KEYS.map(key => [key, uni.getStorageSync(key)]))
  syncSuspended = true
  try {
    for (const key of DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(restored, key)) uni.setStorageSync(key, JSON.stringify(restored[key]))
      else uni.removeStorageSync(key)
    }
  } catch (error) {
    for (const key of DATA_KEYS) try {
      if (previous[key]) uni.setStorageSync(key, previous[key])
      else uni.removeStorageSync(key)
    } catch (_) { /* preserve original error */ }
    throw error
  } finally { syncSuspended = false }
}

export function initDataDirectory() {
  dataDirectory.label = 'Documents/PaperWriter'
  return dataDirectory
}
export function needsDataDirectory() {
  // #ifdef APP-PLUS
  if (androidReady()) return !dataDirectory.ready
  try { return uni.getSystemInfoSync().platform === 'android' && !dataDirectory.ready } catch (_) { return false }
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}
export async function ensureDataDirectory() {
  if (!androidReady()) return 'unavailable'
  if (connecting) return connecting
  if (dataDirectory.ready && hasPermission()) return 'ready'
  dataDirectory.ready = false
  if (!hasPermission()) { dataDirectory.permission = 'required'; return 'permission-required' }
  dataDirectory.permission = 'granted'
  connecting = (async () => {
    dataDirectory.busy = true
    try {
      await syncQueue.catch(() => {})
      const root = documentRoot()
      const existed = !!invoke(root, 'exists')
      if (existed && !invoke(root, 'isDirectory')) throw new Error('Documents/PaperWriter 已被同名文件占用')
      const existingSnapshot = existed ? completedSnapshots(root).length > 0 : false
      // A fresh installation has no app-local data. Existing local books always
      // win during an upgrade; never overwrite them with an older shared backup.
      const localLibrary = uni.getStorageSync('paperwriter.library.v1')
      const localBooks = localLibrary ? (typeof localLibrary === 'string' ? JSON.parse(localLibrary) : localLibrary)?.books || [] : []
      const cleanInstall = !localBooks.length && !DATA_KEYS.some(key => key !== 'paperwriter.library.v1' && uni.getStorageSync(key))
      ensureFolder(root)
      let result = 'ready'
      if (existingSnapshot && cleanInstall) {
        await restoreFrom(root)
        result = 'restored'
      } else if (!existingSnapshot || !cleanInstall) await backupTo(root)
      dataDirectory.uri = absolute(root)
      dataDirectory.ready = true
      dataDirectory.error = ''
      uni.removeStorageSync('paperwriter.dataTree.v1')
      return result
    } catch (error) { dataDirectory.error = error.message || String(error); throw error }
    finally { dataDirectory.busy = false; connecting = null }
  })()
  return connecting
}
export async function requestDataAccess() {
  if (!androidReady()) throw new Error('请在 Android 应用中开启数据目录')
  if (hasPermission()) return ensureDataDirectory()
  const activity = plus.android.runtimeMainActivity()
  const targetSdk = targetSdkVersion()
  if (targetSdk <= 29 && sdkVersion() >= 23) {
    await new Promise(resolve => plus.android.requestPermissions([
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'
    ], resolve, resolve))
    if (hasPermission()) return ensureDataDirectory()
  }
  if (sdkVersion() >= 30) {
    const Intent = androidClass('android.content.Intent')
    const Settings = androidClass('android.provider.Settings')
    const Uri = androidClass('android.net.Uri')
    const packageUri = invoke(Uri, 'parse', `package:${invoke(activity, 'getPackageName')}`)
    try { invoke(activity, 'startActivity', new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, packageUri)) }
    catch (_) { invoke(activity, 'startActivity', new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
    return 'opened-settings'
  }
  return new Promise((resolve, reject) => plus.android.requestPermissions([
    'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'
  ], async result => {
    if (!result.granted?.includes('android.permission.WRITE_EXTERNAL_STORAGE')) return reject(new Error('请允许纸间访问文档目录'))
    try { resolve(await ensureDataDirectory()) } catch (error) { reject(error) }
  }, reject))
}
export function queueDirectorySync() {
  if (!androidReady() || !dataDirectory.ready || syncSuspended) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { flushDirectorySync().catch(error => { dataDirectory.error = error.message || String(error) }) }, 900)
}
export function flushDirectorySync() {
  clearTimeout(syncTimer)
  if (!androidReady() || !dataDirectory.ready || syncSuspended) return Promise.resolve()
  syncQueue = syncQueue.catch(() => {}).then(() => backupTo(documentRoot())).catch(error => { dataDirectory.error = error.message || String(error); throw error })
  return syncQueue
}
export async function mirrorExport(path, extension) {
  if (!androidReady() || !dataDirectory.ready) return ''
  const dir = ensureFolder(child(documentRoot(), 'exports'))
  const name = `纸间-${Date.now()}.${extension.replace(/^\./, '')}`
  const target = child(dir, name)
  await atomicCopy(localFile(path), target)
  return absolute(target)
}
export async function deleteAllData() {
  if (!androidReady() || !dataDirectory.ready) throw new Error('数据目录尚未就绪')
  clearTimeout(syncTimer)
  await syncQueue.catch(() => {})
  syncSuspended = true
  try {
    removeTree(documentRoot())
    for (const key of [...DATA_KEYS, 'paperwriter.imageExportDraft.v1', 'paperwriter.dataTree.v1']) uni.removeStorageSync(key)
    for (const folder of ['_doc/recovered', '_doc/fonts', '_doc/uniapp_save', '_doc/reading']) await new Promise(resolve => {
      plus.io.resolveLocalFileSystemURL(folder, entry => entry.removeRecursively(resolve, resolve), resolve)
    })
    ensureFolder(documentRoot())
    dataDirectory.lastSync = ''
    dataDirectory.error = ''
  } finally { syncSuspended = false }
}
