import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync, rmdirSync, statSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename, dirname } from 'node:path'

test('fixed Documents directory restores books after reinstall without choosing a folder', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'paperwriter-dir-'))
  const storage = new Map()
  const localPath = path => path.startsWith('_doc/') ? join(workspace, 'app', path.slice(5)) : path === '_doc/' ? join(workspace, 'app') : path
  const publicDocuments = join(workspace, 'Documents')
  mkdirSync(localPath('_doc/'), { recursive:true })
  mkdirSync(publicDocuments)
  let granted = false, settingsOpened = false

  class File {
    constructor(parent, name) { this.path = name === undefined ? (parent.path || parent) : join(parent.path || parent, name) }
    exists() { return existsSync(this.path) }
    isFile() { return this.exists() && statSync(this.path).isFile() }
    isDirectory() { return this.exists() && statSync(this.path).isDirectory() }
    mkdirs() { mkdirSync(this.path, { recursive:true }); return true }
    list() { return this.isDirectory() ? readdirSync(this.path) : null }
    length() { return statSync(this.path).size }
    getAbsolutePath() { return this.path }
    getName() { return basename(this.path) }
    getParentFile() { return new File(dirname(this.path)) }
    delete() { if (this.isDirectory()) rmdirSync(this.path); else rmSync(this.path, { force:true }); return true }
    createNewFile() { if (this.exists()) return false; writeFileSync(this.path, ''); return true }
    renameTo(target) { renameSync(this.path, target.path); return true }
  }
  class FileInputStream {
    constructor(file) { this.data = readFileSync(file.path); this.offset = 0 }
    getChannel() { return this }
    close() {}
  }
  class FileOutputStream {
    constructor(file) { this.path = file.path; this.bytes = Buffer.alloc(0) }
    getChannel() { return this }
    transferFrom(source, position, amount) {
      const chunk = source.data.subarray(source.offset, source.offset + amount)
      source.offset += chunk.length
      if (!chunk.length) return 0
      const output = Buffer.alloc(Math.max(this.bytes.length, position + chunk.length))
      this.bytes.copy(output); chunk.copy(output, position); this.bytes = output
      return chunk.length
    }
    flush() { writeFileSync(this.path, this.bytes) }
    close() { this.flush() }
  }
  class Intent { constructor(action, uri) { this.action = action; this.uri = uri } }
  const Environment = {
    DIRECTORY_DOCUMENTS:'Documents',
    getExternalStoragePublicDirectory:() => new File(publicDocuments),
    isExternalStorageManager:() => granted
  }
  const activity = { getPackageName:() => 'app.paperwriter', startActivity:() => { settingsOpened = true } }
  globalThis.plus = {
    os:{ name:'Android' },
    android:{
      runtimeMainActivity:() => activity,
      importClass:name => ({
        'android.os.Build$VERSION':{ SDK_INT:35 },
        'android.os.Environment':Environment,
        'java.io.File':File,
        'java.io.FileInputStream':FileInputStream,
        'java.io.FileOutputStream':FileOutputStream,
        'android.content.Intent':Intent,
        'android.provider.Settings':{ ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION:'grant', ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION:'all' },
        'android.net.Uri':{ parse:value => value }
      })[name],
      invoke:(object,method,...args) => object[method](...args)
    },
    io:{
      convertLocalFileSystemURL:localPath,
      resolveLocalFileSystemURL(path, success, fail) {
        const absolute = localPath(path)
        if (!existsSync(absolute)) return fail?.()
        success({
          getFile(name, options, done) {
            const file = join(absolute, name)
            if (options.create && !existsSync(file)) writeFileSync(file, '')
            done({ createWriter(callback) { callback({
              onwriteend:null, onerror:null,
              truncate() { writeFileSync(file, ''); setTimeout(() => this.onwriteend?.(), 0) },
              write(content) { writeFileSync(file, content, 'utf8'); setTimeout(() => this.onwriteend?.(), 0) }
            }) } })
          },
          file(done) { done({ path:absolute }) },
          removeRecursively(done) { rmSync(absolute, { recursive:true, force:true }); done() }
        })
      },
      FileReader:class { readAsText(file) { this.result = readFileSync(file.path, 'utf8'); setTimeout(() => this.onloadend?.(), 0) } }
    }
  }
  globalThis.uni = { getStorageSync:key => storage.get(key) || '', setStorageSync:(key,value) => storage.set(key,value), removeStorageSync:key => storage.delete(key) }
  try {
    writeFileSync(localPath('_doc/cover.png'), 'cover bytes')
    storage.set('paperwriter.library.v1', JSON.stringify({ version:1, books:[{ id:'book', title:'书', cover:'_doc/cover.png', chapters:[] }] }))
    const service = await import('../src/services/data-directory.js')
    assert.equal(await service.ensureDataDirectory(), 'permission-required')
    assert.equal(await service.requestDataAccess(), 'opened-settings')
    assert.equal(settingsOpened, true)
    granted = true
    assert.equal(await service.ensureDataDirectory(), 'ready')
    const root = join(publicDocuments, 'PaperWriter')
    assert.equal(existsSync(root), true)
    assert.equal(readdirSync(root).filter(name => /^snapshot-\d+\.ok$/.test(name)).length, 1)
    writeFileSync(join(root, 'snapshot-9999999999999.json'), '{incomplete')

    // Simulate an uninstall: app-local storage and media disappear, public Documents remains.
    storage.clear()
    rmSync(localPath('_doc/cover.png'))
    service.dataDirectory.ready = false
    granted = false
    assert.equal(await service.ensureDataDirectory(), 'permission-required')
    granted = true
    assert.equal(await service.ensureDataDirectory(), 'restored')
    const book = JSON.parse(storage.get('paperwriter.library.v1')).books[0]
    assert.equal(readFileSync(localPath(book.cover), 'utf8'), 'cover bytes')
    assert.equal(service.dataDirectory.uri, root)

    writeFileSync(localPath('_doc/export.png'), 'picture')
    const exportPath = await service.mirrorExport('_doc/export.png', 'png')
    assert.equal(readFileSync(exportPath, 'utf8'), 'picture')
    await service.deleteAllData()
    assert.equal(storage.has('paperwriter.library.v1'), false)
    assert.equal(readdirSync(root).length, 0)
  } finally {
    delete globalThis.plus; delete globalThis.uni
    rmSync(workspace, { recursive:true, force:true })
  }
})
