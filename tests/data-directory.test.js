import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('external data directory backs up and restores book assets and settings', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'paperwriter-dir-'))
  const storage = new Map()
  const docs = new Map()
  let documentId = 0, selectedRoot = 'root-a'
  const folderMime = 'vnd.android.document/directory'
  function folder(id, name) { docs.set(id, { id, name, mime:folderMime, children:[], bytes:Buffer.alloc(0) }) }
  folder('root-a','First'); folder('root-b','Second')
  const uri = (kind, id) => ({ kind, id, toString() { return `${kind}:${id}` } })
  const localPath = path => path.startsWith('_doc/') ? join(workspace, path.slice(5)) : path
  const Contract = {
    getTreeDocumentId: tree => tree.id,
    buildDocumentUriUsingTree: (_, id) => uri('doc',id),
    buildChildDocumentsUriUsingTree: (_, id) => uri('children',id),
    getDocumentId: document => document.id,
    createDocument: (_, parent, mime, name) => {
      const id = `file-${++documentId}`
      docs.set(id,{ id,name,mime,children:[],bytes:Buffer.alloc(0) })
      docs.get(parent.id).children.push(id)
      return uri('doc',id)
    },
    deleteDocument: (_, target) => {
      if (!docs.has(target.id)) return false
      for (const entry of docs.values()) entry.children = entry.children.filter(id => id !== target.id)
      const remove = id => { const item = docs.get(id); for (const child of item.children) remove(child); docs.delete(id) }
      remove(target.id); return true
    }
  }
  const resolver = {
    query: target => {
      const rows = docs.get(target.id).children.map(id => docs.get(id))
      let index = -1
      return {
        moveToNext() { index++; return index < rows.length },
        getColumnIndex(name) { return { _display_name:0, document_id:1, mime_type:2 }[name] },
        getString(column) { return [rows[index].name, rows[index].id, rows[index].mime][column] },
        close() {}
      }
    },
    takePersistableUriPermission() {},
    openFileDescriptor(target) { return { getFileDescriptor() { return { documentId:target.id } }, close() {} } },
    openInputStream(target) { return { data:Buffer.from(docs.get(target.id).bytes), offset:0, close() {} } }
  }
  class File {
    constructor(parent, name) { this.path = name ? join(parent.path || parent, name) : parent }
    exists() { return existsSync(this.path) }
    isFile() { return existsSync(this.path) && statSync(this.path).isFile() }
    mkdirs() { mkdirSync(this.path,{recursive:true}); return true }
    length() { return statSync(this.path).size }
    delete() { rmSync(this.path,{force:true}); return true }
  }
  class FileInputStream {
    constructor(file) { this.data = readFileSync(file.path); this.offset = 0 }
    getChannel() { return this }
    close() {}
  }
  class FileOutputStream {
    constructor(target) { this.target = target; this.bytes = Buffer.alloc(0) }
    getChannel() { return this }
    transferFrom(source, position, amount) {
      const chunk = source.data.subarray(source.offset, source.offset + amount)
      source.offset += chunk.length
      if (!chunk.length) return 0
      const output = Buffer.alloc(Math.max(this.bytes.length, position + chunk.length))
      this.bytes.copy(output); chunk.copy(output, position); this.bytes = output
      return chunk.length
    }
    flush() {
      if (this.target.documentId) docs.get(this.target.documentId).bytes = Buffer.from(this.bytes)
      else writeFileSync(this.target.path,this.bytes)
    }
    close() { this.flush() }
  }
  class Intent {
    constructor(action) { this.action = action }
    addFlags() {}
  }
  Object.assign(Intent,{ ACTION_OPEN_DOCUMENT_TREE:'tree', FLAG_GRANT_READ_URI_PERMISSION:1, FLAG_GRANT_WRITE_URI_PERMISSION:2, FLAG_GRANT_PERSISTABLE_URI_PERMISSION:64 })
  const activity = {
    getContentResolver:() => resolver,
    onActivityResult:null,
    startActivityForResult(intent, code) { setTimeout(() => this.onActivityResult(code,-1,{ getData:() => uri('tree',selectedRoot) }),0) }
  }
  globalThis.plus = {
    os:{ name:'Android' },
    android:{ runtimeMainActivity:() => activity, importClass:name => ({
      'android.provider.DocumentsContract':Contract,
      'android.net.Uri':{ parse:value => uri(...value.split(':')) },
      'android.content.Intent':Intent,
      'java.io.File':File,
      'java.io.FileInputStream':FileInputStream,
      'java.io.FileOutputStream':FileOutputStream,
      'java.nio.channels.Channels':{ newChannel:stream => stream }
    })[name], invoke:(object,method,...args) => object[method](...args) },
    io:{
      convertLocalFileSystemURL:localPath,
      resolveLocalFileSystemURL(path,success,fail) {
        const absolute = localPath(path)
        if (!existsSync(absolute)) return fail?.()
        success({
          getFile(name,options,done) { const file = join(absolute,name); if(options.create && !existsSync(file)) writeFileSync(file,''); done({ createWriter(callback) { callback({
            onwriteend:null,onerror:null,
            truncate() { writeFileSync(file,''); setTimeout(() => this.onwriteend?.(),0) },
            write(content) { writeFileSync(file,content,'utf8'); setTimeout(() => this.onwriteend?.(),0) }
          }) } }) },
          file(done) { done({ path:absolute }) },
          removeRecursively(done) { rmSync(absolute,{recursive:true,force:true}); done() }
        })
      },
      FileReader:class { readAsText(file) { this.result = readFileSync(file.path,'utf8'); setTimeout(() => this.onloadend?.(),0) } }
    }
  }
  globalThis.uni = { getStorageSync:key => storage.get(key) || '', setStorageSync:(key,value) => storage.set(key,value), removeStorageSync:key => storage.delete(key) }
  try {
    mkdirSync(workspace,{recursive:true})
    writeFileSync(join(workspace,'cover.png'),'cover bytes')
    writeFileSync(join(workspace,'font.ttf'),'font bytes')
    storage.set('paperwriter.library.v1',JSON.stringify({version:1,books:[{id:'book',title:'书',cover:'_doc/cover.png',chapters:[]}]}))
    storage.set('paperwriter.preferences.v1',JSON.stringify({theme:'light',customFonts:[{id:'font',path:'_doc/font.ttf'}]}))
    const service = await import('../src/services/data-directory.js')
    assert.equal(await service.chooseDataDirectory(),'ready')
    const first = [...docs.values()].filter(item => /^snapshot-\d+\.ok$/.test(item.name))
    assert.equal(first.length,1)
    const app = docs.get(docs.get('root-a').children[0])
    const interrupted = Contract.createDocument(resolver,uri('doc',app.id),'application/json',`snapshot-${Date.now() + 10000}.json`)
    docs.get(interrupted.id).bytes = Buffer.from('{incomplete')
    storage.clear(); rmSync(join(workspace,'cover.png')); rmSync(join(workspace,'font.ttf'))
    service.initDataDirectory()
    assert.equal(await service.chooseDataDirectory(),'restored')
    const restoredBook = JSON.parse(storage.get('paperwriter.library.v1')).books[0]
    const restoredFont = JSON.parse(storage.get('paperwriter.preferences.v1')).customFonts[0]
    assert.equal(readFileSync(localPath(restoredBook.cover),'utf8'),'cover bytes')
    assert.equal(readFileSync(localPath(restoredFont.path),'utf8'),'font bytes')
    selectedRoot = 'root-b'
    assert.equal(await service.chooseDataDirectory({migrate:true}),'ready')
    assert.ok([...docs.values()].some(item => item.name === 'PaperWriter' && docs.get('root-b').children.includes(item.id)))
    await service.deleteAllData()
    assert.equal(storage.has('paperwriter.library.v1'),false)
    assert.equal(docs.get('root-a').children.length,1)
  } finally {
    delete globalThis.plus; delete globalThis.uni
    rmSync(workspace,{recursive:true,force:true})
  }
})
