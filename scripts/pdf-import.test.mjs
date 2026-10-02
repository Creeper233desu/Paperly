import 'core-js/actual/index.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import vm from 'node:vm'
import { build } from 'esbuild'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { samplePdf } from './create-pdf-fixture.mjs'
import { extractPdfDocument, buildPdfBook } from '../src/services/pdf-import.js'
import { encodePdfImage, extractPdfPageImages } from '../src/services/pdf-images.js'
import { importedBookSummary } from '../src/services/docx-import.js'
import { imageIdFromParagraph } from '../src/utils/media.js'
import { savePdfImage, removePdfImageFiles } from '../src/services/pdf-image-files.js'

function decodePng(encoded) {
  const png = Buffer.from(encoded.dataUrl.split(',')[1], 'base64'), streams = []
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8)
    if (type === 'IHDR') { assert.equal(png.readUInt32BE(at + 8), encoded.width); assert.equal(png.readUInt32BE(at + 12), encoded.height) }
    if (type === 'IDAT') streams.push(png.subarray(at + 8, at + 8 + size))
    at += size + 12
  }
  const pixels = inflateSync(Buffer.concat(streams)), rgba = []
  for (let y = 0; y < encoded.height; y++) {
    const at = y * (encoded.width * 4 + 1)
    assert.equal(pixels[at], 0)
    rgba.push(...pixels.subarray(at + 1, at + 1 + encoded.width * 4))
  }
  return rgba
}
const rgb = { width: 2, height: 2, kind: 2, data: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]) }
const parse = options => extractPdfDocument(pdfjs, new Uint8Array(samplePdf(options)))

test('PNG encoder preserves RGB, RGBA transparency and packed grayscale rows', () => {
  assert.deepEqual(decodePng(encodePdfImage(rgb)), [255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255])
  const rgba = { width: 2, height: 1, kind: 3, data: new Uint8Array([255,0,0,128, 0,255,0,0]) }
  assert.deepEqual(decodePng(encodePdfImage(rgba)), [...rgba.data])
  const gray = { width: 3, height: 2, kind: 1, data: new Uint8Array([0xa0, 0x40]) }
  assert.deepEqual(decodePng(encodePdfImage(gray)).filter((_, index) => index % 4 === 0), [255,0,255,0,255,0])
})

test('PNG encoder keeps rotation, mirroring and optimized image crops', () => {
  const rotated = encodePdfImage(rgb, [0,2,-2,0,0,0])
  assert.deepEqual(decodePng(rotated), [0,255,0,255, 255,255,0,255, 255,0,0,255, 0,0,255,255])
  const mirrored = encodePdfImage(rgb, [-2,0,0,2,0,0])
  assert.deepEqual(decodePng(mirrored).slice(0, 8), [0,255,0,255, 255,0,0,255])
  assert.deepEqual(decodePng(encodePdfImage(rgb, [1,0,0,2,0,0], { x:1,y:0,w:1,h:2 })), [0,255,0,255, 255,255,0,255])
  assert.throws(() => encodePdfImage({ ...rgb, data: new Uint8Array(1) }), /无法读取/)
})

test('real text PDF still recovers chapters, paragraphs and metadata', async () => {
  const result = await parse(), book = buildPdfBook(result.pages, result.metadata)
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一章 初见', '第二章 回声'])
  assert.equal(book.author, '测试作者'); assert.equal(book.imageCount, 0)
  assert.deepEqual(book.warnings, [])
  assert.ok(book.chapters[0].articles[0].paragraphs.includes('她推开窗，街上的风穿过树影，落在书页间。'))
})

test('real embedded images retain soft masks, page order and reusable resources', async () => {
  const result = await parse({ images: true }), book = buildPdfBook(result.pages, result.metadata, 'test.pdf', result.warnings)
  assert.equal(book.imageCount, 2); assert.deepEqual(book.warnings, [])
  const article = book.chapters[0].articles[0], index = article.paragraphs.findIndex(imageIdFromParagraph)
  assert.equal(article.paragraphs[index - 1], '清晨的书店刚刚开门。')
  assert.equal(article.paragraphs[index + 1], '她推开窗，街上的风穿过树影，落在书页间。')
  const image = article.images[imageIdFromParagraph(article.paragraphs[index])]
  assert.match(image.path, /^data:image\/png;base64,/)
  const alpha = decodePng({ ...image, dataUrl: image.path }).filter((_, at) => at % 4 === 3)
  assert.ok(alpha.includes(128)); assert.ok(alpha.includes(0))
  const summary = importedBookSummary(book)
  assert.equal(summary.words, importedBookSummary(buildPdfBook((await parse()).pages)).words)
})

test('image-only PDFs import instead of failing; blank PDFs remain rejected', async () => {
  const result = await parse({ blank: true, images: true }), book = buildPdfBook(result.pages)
  assert.equal(book.imageCount, 2); assert.equal(importedBookSummary(book).words, 0)
  assert.match(book.warnings[0], /2 页仅含图片/)
  assert.throws(() => buildPdfBook([[], []]), /没有可提取的文字或内嵌图片/)
})

test('real inline images are imported alongside editable text', async () => {
  const result = await parse({ inline: true }), book = buildPdfBook(result.pages)
  assert.equal(book.imageCount, 2); assert.deepEqual(result.warnings, [])
})

function fakePage(fnArray, argsArray, objects = new Map()) {
  const store = { has: id => objects.has(id), get: (id, callback) => callback ? setTimeout(() => callback(objects.get(id)), 0) : objects.get(id) }
  return { view:[0,0,595,842], getOperatorList:async () => ({ fnArray, argsArray }), objs:store, commonObjs:store }
}
test('operator extraction follows nested forms, repeated objects and shared async resources', async () => {
  const { OPS:o } = pdfjs
  const page = fakePage([o.save,o.transform,o.paintFormXObjectBegin,o.paintImageXObjectRepeat,o.paintFormXObjectEnd,o.restore,o.paintImageXObject],
    [[],[1,0,0,1,10,20],[[1,0,0,1,30,40]],[ 'g_image',2,2,[0,0,5,0] ],[],[],['g_image']])
  page.commonObjs = { has:()=>false, get:(_id, callback)=>setTimeout(()=>callback(rgb),0) }
  const result = await extractPdfPageImages(pdfjs, page, 1)
  assert.equal(result.images.length, 3); assert.deepEqual(result.warnings, [])
  assert.deepEqual(result.images.map(image => [image.x,image.y]), [[40,62],[45,62],[0,1]])
})

test('decode failures warn, while storage failures and cancellation abort', async () => {
  const page = fakePage([pdfjs.OPS.paintInlineImageXObject], [[null]])
  assert.match((await extractPdfPageImages(pdfjs, page, 3)).warnings[0], /第 3 页有 1 处/)
  const valid = fakePage([pdfjs.OPS.paintInlineImageXObject], [[rgb]])
  await assert.rejects(extractPdfPageImages(pdfjs, valid, 1, { onImage:async()=>{ throw new Error('disk full') } }), /disk full/)
  await assert.rejects(extractPdfPageImages(pdfjs, valid, 1, { checkCancelled:()=>{ throw new Error('已取消导入') } }), /取消/)
})

test('images in two-column pages stay with their own column', async () => {
  const content = []
  for (let row = 0; row < 4; row++) for (const [label,x] of [['left',50],['right',310]]) content.push({ str:`${label}${row}`,width:140,transform:[14,0,0,14,x,750-row*50] })
  const page = fakePage([pdfjs.OPS.transform,pdfjs.OPS.paintInlineImageXObject], [[100,0,0,30,50,610],[rgb]])
  page.getTextContent = async () => ({ items:content }); page.cleanup = () => {}
  const doc = { numPages:1,getMetadata:async()=>({info:{}}),getPage:async()=>page }
  const engine = { OPS:pdfjs.OPS,getDocument:()=>({promise:Promise.resolve(doc),destroy:async()=>{}}) }
  const result = await extractPdfDocument(engine,new TextEncoder().encode('%PDF-fixture'))
  assert.deepEqual(result.pages[0].map(item=>item.text || 'image'), ['left0','left1','left2','image','left3','right0','right1','right2','right3'])
})

test('repeated headers are removed without dropping margin images', () => {
  const pages = [1,2,3].map(page=>[
    { text:'header',x:50,right:150,y:815,size:14,page,pageHeight:842 },
    { type:'image',x:50,right:150,y:820,bottom:790,page,pageHeight:842,media:{path:`_doc/${page}.png`,width:100,height:30} },
    { text:`body${page}。`,x:50,right:150,y:700,size:14,page,pageHeight:842 },
    { text:String(page),x:50,right:150,y:20,size:14,page,pageHeight:842 }
  ])
  const book = buildPdfBook(pages)
  assert.equal(book.imageCount,3)
  assert.deepEqual(book.chapters[0].articles[0].paragraphs.filter(item=>!imageIdFromParagraph(item)),['body1。','body2。','body3。'])
})

function bridge(save, remove = () => {}) {
  const source = readFileSync(new URL('../components/PdfImportBridge.vue', import.meta.url), 'utf8')
  const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1].replace(/^import .*$/gm, '').replace('export default', 'return'))
  const ownerOptions = new Function('readPdfBase64','savePdfImage','removePdfImageFiles',scripts[0])(() => {}, save, remove)
  const renderOptions = new Function('extractPdfDocument', scripts[1])(extractPdfDocument)
  const owner = { ...ownerOptions.data(), ...ownerOptions.methods }, render = { ...renderOptions.methods }
  let packet = ''
  Object.defineProperty(owner, 'packet', { get:()=>packet, set:value=>{ if (value !== packet) { packet = value; queueMicrotask(()=>render.receive(value)) } } })
  render.$ownerInstance = { callMethod:(method,data)=>queueMicrotask(()=>owner[method](data)) }
  return { owner, render }
}

test('bridge transfers more than two image chunks without repeating identical acknowledgements', async () => {
  let saved
  const { owner, render } = bridge(async image => { saved = image; return { path:'_doc/saved.png',width:image.width,height:image.height } })
  owner.pending = { id:1, imagePaths:[] }; render.activeId = 1
  const image = { dataUrl:'data:image/png;base64,' + 'A'.repeat(400000),width:10,height:20 }
  const media = await render.transferImage(1, image)
  clearTimeout(owner.timeout)
  assert.deepEqual(saved, image); assert.equal(media.path, '_doc/saved.png')
  assert.deepEqual(owner.pending.imagePaths, ['_doc/saved.png'])
})

test('cancelled bridge removes already saved and late finishing images', async () => {
  const removed = [], { owner, render } = bridge(async () => ({ path:'_doc/late.png',width:1,height:1 }), paths=>removed.push(...paths))
  let rejection
  owner.pending = { id:2,imagePaths:['_doc/early.png'],reject:error=>{ rejection = error },resolve:()=>{} }; render.activeId = 2
  const promise = render.transferImage(2, { dataUrl:'data:image/png;base64,AAAA',width:1,height:1 })
  queueMicrotask(()=>owner.cancel())
  await assert.rejects(promise, /取消/)
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.match(rejection.message, /取消/)
  assert.deepEqual(removed.sort(), ['_doc/early.png','_doc/late.png'])
})

test('native image staging is persisted and cleaned up on save failures', async () => {
  const calls = [], previous = globalThis.plus
  globalThis.plus = { nativeObj:{ Bitmap:class {
    loadBase64Data(_data,success) { success() }
    save(path,_options,success) { calls.push(['staging',path]); success() }
    clear() { calls.push(['clear']) }
  } }, io:{ resolveLocalFileSystemURL:(path,success)=>success({ remove:()=>calls.push(['remove',path]) }) } }
  try {
    const media = await savePdfImage({ dataUrl:'data:image/png;base64,AAAA',width:2,height:3 }, { saveFile:options=>options.success({ savedFilePath:'_doc/durable.png' }) })
    assert.deepEqual(media, { path:'_doc/durable.png',width:2,height:3 })
    assert.equal(calls[0][1], calls.find(item=>item[0]==='remove')[1])
    await assert.rejects(savePdfImage({ dataUrl:'data:image/png;base64,AAAA',width:2,height:3 }, { saveFile:options=>options.fail({}) }), /保存失败/)
    assert.equal(calls.filter(item=>item[0]==='clear').length, 2)
    const paths = []
    removePdfImageFiles(['a','a','b'], { removeSavedFile:options=>paths.push(options.filePath) })
    assert.deepEqual(paths, ['a','b'])
  } finally { globalThis.plus = previous }
})

test('packaged offline engine imports images through both bridge layers in a Chrome 74 context', async () => {
  const base64 = samplePdf({ images:true,builtinMap:true }).toString('base64'), saved = [], removed = [], progress = []
  const context = vm.createContext({ console,URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout,queueMicrotask,
    atob,btoa,DOMException,AbortController,AbortSignal,ReadableStream,DOMMatrix:class {},navigator:{userAgent:'Mozilla/5.0 Chrome/74'},
    uni:{ saveFile:options=>options.success({savedFilePath:`_doc/durable-${saved.length}.png`}),removeSavedFile:options=>removed.push(options.filePath) },
    plus:{ nativeObj:{ Bitmap:class {
      loadBase64Data(data,success) { this.data = data; success() }
      save(_path,_options,success) { saved.push(this.data); success() }
      clear() {}
    } }, io:{ resolveLocalFileSystemURL:(path,success)=>success({file:callback=>callback({size:base64.length*.75}),remove:()=>removed.push(path)}),
      FileReader:class { readAsDataURL() { this.onloadend({target:{result:`data:application/pdf;base64,${base64}`}}) } } } }
  })
  context.window = context; context.self = context
  context.document = { baseURI:'file:///app/',currentScript:null,createElement:()=>({remove(){}}),head:{appendChild(script) {
    const name = script.src.replace('./static/pdfjs/','')
    vm.runInContext(readFileSync(new URL(`../static/pdfjs/${name}`,import.meta.url),'utf8'),context)
    queueMicrotask(()=>script.onload())
  } } }
  vm.runInContext('Array.prototype.at = undefined; Promise.withResolvers = undefined; globalThis.structuredClone = undefined;',context)
  const source = readFileSync(new URL('../components/PdfImportBridge.vue',import.meta.url),'utf8')
  for (const [index,match] of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
    const result = await build({stdin:{contents:match[1],resolveDir:new URL('../components/',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')},
      bundle:true,write:false,platform:'browser',format:'iife',globalName:index===0?'Logic':'Renderer',target:'chrome74'})
    vm.runInContext(result.outputFiles[0].text,context)
  }
  const owner = {...context.Logic.default.data(),$emit:(_event,data)=>progress.push(data)}
  for (const [name,method] of Object.entries(context.Logic.default.methods)) owner[name] = method.bind(owner)
  const render = {$ownerInstance:{callMethod:(method,data)=>queueMicrotask(()=>owner[method](data))}}
  for (const [name,method] of Object.entries(context.Renderer.default.methods)) render[name] = method.bind(render)
  let packet = ''
  Object.defineProperty(owner,'packet',{get:()=>packet,set:value=>{ if (value!==packet) { packet=value;queueMicrotask(()=>render.receive(value)) } }})
  const result = await owner.parse({path:'_doc/sample.pdf'})
  assert.equal(saved.length,2); assert.equal(progress.length,2); assert.equal(owner.pending,null)
  assert.deepEqual(Array.from(result.pages,page=>page.find(item=>item.type==='image').media.path),['_doc/durable-1.png','_doc/durable-2.png'])
  assert.equal(removed.filter(path=>path.startsWith('_doc/pdf-image-')).length,2)
  assert.equal(removed.filter(path=>path.startsWith('_doc/durable-')).length,0)
})
