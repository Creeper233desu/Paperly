import { build } from 'esbuild'
import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises'

// Commit these offline assets: HBuilderX cloud packaging does not run npm scripts.
const root = 'static/pdfjs'
await mkdir(root, { recursive: true })
for (const [entry, globalName, output] of [
  ['pdf.mjs', 'pdfjsLib', 'pdf.js'], ['pdf.worker.mjs', 'pdfjsWorker', 'pdf.worker.js']
]) {
  const source = `${entry === 'pdf.mjs' ? "import 'core-js/actual';" : ''} export * from 'pdfjs-dist/legacy/build/${entry}';`
  await build({ stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'pdf-runtime.js' }, bundle: true,
    format: 'iife', globalName, target: ['chrome74'], platform: 'browser', minify: true,
    external: ['node:*', 'fs', 'canvas'], outfile: `${root}/${output}`, legalComments: 'eof' })
}
// Embed CMaps so Chinese fonts work offline, including file:// WebViews without fetch.
const cmaps = {}
for (const name of await readdir('node_modules/pdfjs-dist/cmaps')) {
  if (name.endsWith('.bcmap')) cmaps[name.slice(0, -6)] = (await readFile(`node_modules/pdfjs-dist/cmaps/${name}`)).toString('base64')
}
await writeFile(`${root}/cmaps.js`, `window.paperPdfCMaps=${JSON.stringify(cmaps)};\n`)
await copyFile('node_modules/pdfjs-dist/LICENSE', `${root}/LICENSE`)
await copyFile('node_modules/pdfjs-dist/cmaps/LICENSE', `${root}/CMAP-LICENSE`)
await copyFile('node_modules/core-js/LICENSE', `${root}/CORE-JS-LICENSE`)
await writeFile(`${root}/README.md`, 'PDF.js 4.10.38 (Mozilla, Apache-2.0), legacy build transpiled for Chrome 74, with core-js runtime polyfills (MIT).\nRebuild with `node scripts/build-pdf-runtime.mjs`. CMaps are bundled for offline Chinese text extraction.\nNo PDF scripting or eval is enabled. Files in this folder must be included in cloud packaging.\n')
