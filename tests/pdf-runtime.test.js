import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { samplePdf } from '../scripts/create-pdf-fixture.mjs'

async function componentModule(source, name) {
  const result = await build({ stdin:{ contents:source, resolveDir:new URL('../components/',import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), sourcefile:'bridge.js' }, bundle:true, write:false, platform:'browser', format:'iife', globalName:name, target:'chrome74' })
  return result.outputFiles[0].text
}

test('the packaged offline PDF engine and chunked App bridge work without at or native structuredClone', async () => {
  // This variant needs the bundled Adobe CMaps, not an embedded ToUnicode table.
  const base64 = samplePdf({ builtinMap:true }).toString('base64')
  const events = [], loaded = []
  const context = vm.createContext({ console, URL, URLSearchParams, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask,
    atob, btoa, DOMException, AbortController, AbortSignal, ReadableStream,
    // No rendering is requested; PDF.js constructs its canvas matrix at module load.
    DOMMatrix:class {}, navigator:{ userAgent:'Mozilla/5.0 Chrome/74' },
    plus:{ io:{ resolveLocalFileSystemURL:(_path,success) => success({ file:callback => callback({ size:base64.length * .75 }) }),
      FileReader:class { readAsDataURL() { this.onloadend({ target:{ result:`data:application/pdf;base64,${base64}` } }) } } } }
  })
  context.window = context; context.self = context
  context.document = { baseURI:'file:///app/', currentScript:null, createElement:() => ({ remove() {} }), head:{ appendChild(script) {
    try {
      const file = script.src.replace('./static/', '../static/')
      loaded.push(file)
      vm.runInContext(readFileSync(new URL(file, import.meta.url),'utf8'),context)
      queueMicrotask(() => script.onload())
    } catch (error) { console.error(error.message); queueMicrotask(() => script.onerror(error)) }
  } } }
  vm.runInContext('Array.prototype.at = undefined; Promise.withResolvers = undefined; globalThis.structuredClone = undefined;',context)
  const source = readFileSync(new URL('../components/PdfImportBridge.vue', import.meta.url),'utf8')
  const logicSource = source.match(/<script>([\s\S]*?)<\/script>/)[1]
  const renderSource = source.match(/<script module="pdfRender" lang="renderjs">([\s\S]*?)<\/script>/)[1]
  vm.runInContext(await componentModule(logicSource,'Logic'),context)
  vm.runInContext(await componentModule(renderSource,'Renderer'),context)
  const logic = { ...context.Logic.default.data(), $emit:(event,data) => events.push([event,data]) }
  for (const [name,method] of Object.entries(context.Logic.default.methods)) logic[name] = method.bind(logic)
  const renderer = { $ownerInstance:{ callMethod(name,data) { queueMicrotask(() => logic[name](data)) } } }
  renderer.receive = context.Renderer.default.methods.receive.bind(renderer)
  let chunks = 0
  Object.defineProperty(logic,'packet',{ set(raw) { if (raw.includes('"step":"chunk"')) chunks++; queueMicrotask(() => renderer.receive(raw)) } })
  const result = await logic.parse({ path:'_doc/imports/sample.pdf' })
  assert.equal(result.pages.length,2)
  assert.equal(result.metadata.title,'纸间 PDF 导入示例')
  assert.ok(result.pages[0].some(line => line.text === '清晨的书店刚刚开门。'))
  assert.ok(chunks > 0)
  assert.equal(events.filter(event => event[0] === 'progress').length,2)
  assert.deepEqual(loaded,['../static/pdfjs/pdf.js','../static/pdfjs/pdf.worker.js','../static/pdfjs/cmaps.js'])
  assert.equal(logic.pending,null)
})
