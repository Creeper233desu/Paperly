import { strFromU8, unzipSync } from 'fflate'
import { DOMParser } from '@xmldom/xmldom'

const MAX_ARCHIVE = 32 * 1024 * 1024
const MAX_UNPACKED = 160 * 1024 * 1024
const MAX_PART = 32 * 1024 * 1024
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre'])
const SKIP = new Set(['script', 'style', 'nav', 'head', 'metadata'])

const local = node => node?.localName || node?.nodeName?.split(':').pop() || ''
const elements = node => Array.from(node?.childNodes || []).filter(item => item.nodeType === 1)
const descendants = (node, name) => {
  const found = []
  const visit = current => { for (const item of elements(current)) { if (local(item) === name) found.push(item); visit(item) } }
  visit(node)
  return found
}
const first = (node, name) => descendants(node, name)[0]
const attr = (node, name) => node?.getAttribute(name) || node?.getAttribute(`opf:${name}`) || ''
const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim()

function xml(bytes, label) {
  if (!bytes) throw new Error(`EPUB 缺少 ${label}`)
  const errors = []
  const document = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(message) } }).parseFromString(strFromU8(bytes), 'application/xml')
  if (errors.length || local(document.documentElement) === 'parsererror') throw new Error(`EPUB 的 ${label} 无法解析`)
  return document
}

function resolvePath(base, href) {
  const raw = String(href || '').split('#')[0].split('?')[0]
  if (!raw || /^(?:https?:|data:|\/\/)/i.test(raw)) return ''
  const parts = (base ? base.split('/').slice(0, -1) : []).concat(raw.split('/'))
  const result = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') result.pop()
    else { try { result.push(decodeURIComponent(part)) } catch (_) { result.push(part) } }
  }
  return result.join('/')
}

function tocEntries(archive, packagePath, manifest, spine) {
  let navItem = [...manifest.values()].find(item => item.properties.split(/\s+/).includes('nav'))
  const entries = []
  if (navItem && archive[navItem.path]) {
    const nav = descendants(xml(archive[navItem.path], '目录'), 'nav').find(item => /(?:^|\s)toc(?:\s|$)/.test(attr(item, 'epub:type') || attr(item, 'type')))
    const walk = (list, level, parent) => {
      for (const li of elements(list).filter(item => local(item) === 'li')) {
        const link = elements(li).find(item => ['a', 'span'].includes(local(item)))
        const title = text(link)
        const href = attr(link, 'href')
        if (href && title) entries.push({ path: resolvePath(navItem.path, href), fragment: href.split('#')[1] || '', title, level, parent })
        const nested = elements(li).find(item => local(item) === 'ol')
        if (nested) walk(nested, level + 1, level === 1 ? title : parent)
      }
    }
    const list = elements(nav).find(item => local(item) === 'ol')
    if (list) walk(list, 1, '')
  }
  if (!entries.length) {
    const ncx = [...manifest.values()].find(item => item.mediaType === 'application/x-dtbncx+xml' || item.id === spine.toc)
    if (ncx && archive[ncx.path]) {
      const navMap = first(xml(archive[ncx.path], 'NCX 目录'), 'navMap')
      const walk = (node, level, parent) => {
        for (const point of elements(node).filter(item => local(item) === 'navPoint')) {
          const title = text(first(point, 'text'))
          const href = attr(first(point, 'content'), 'src')
          if (href && title) entries.push({ path: resolvePath(ncx.path, href), fragment: href.split('#')[1] || '', title, level, parent })
          walk(point, level + 1, level === 1 ? title : parent)
        }
      }
      walk(navMap, 1, '')
    }
  }
  return entries
}

function contentBlocks(document, path) {
  const body = first(document.documentElement, 'body')
  if (!body) return []
  const blocks = []
  let buffer = ''
  function flush(context) {
    const value = buffer.replace(/[\t\r\n ]+/g, ' ').trim()
    if (value) blocks.push({ type: context.kind, text: value, anchor: context.anchor })
    buffer = ''
  }
  function walk(node, context) {
    if (node.nodeType === 3 || node.nodeType === 4) { buffer += node.nodeValue || ''; return }
    if (node.nodeType !== 1) return
    const name = local(node)
    if (SKIP.has(name)) return
    const anchor = attr(node, 'id') || context.anchor
    if (name === 'img' || name === 'image') {
      flush(context)
      const imagePath = resolvePath(path, attr(node, 'src') || attr(node, 'xlink:href') || attr(node, 'href'))
      if (imagePath) blocks.push({ type: 'image', path: imagePath, alt: attr(node, 'alt'), anchor })
      return
    }
    if (name === 'br') { buffer += ' '; return }
    const boundary = BLOCKS.has(name)
    if (boundary) flush(context)
    const next = { kind: /^h[1-6]$/.test(name) ? 'heading' : 'paragraph', anchor }
    for (const child of Array.from(node.childNodes || [])) walk(child, boundary ? next : { ...context, anchor })
    if (boundary) flush(next)
  }
  for (const child of Array.from(body.childNodes || [])) walk(child, { kind: 'paragraph', anchor: '' })
  flush({ kind: 'paragraph', anchor: '' })
  return blocks
}

function bytesToBase64(bytes) {
  const data = bytes.byteOffset || bytes.byteLength !== bytes.buffer.byteLength ? bytes.slice().buffer : bytes.buffer
  if (typeof uni !== 'undefined' && typeof uni.arrayBufferToBase64 === 'function') return uni.arrayBufferToBase64(data)
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  throw new Error('当前设备无法显示 EPUB 图片')
}
function imageMime(path) {
  const extension = path.toLowerCase().split('.').pop()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' })[extension] || ''
}

export function epubImageSource(epub, path) {
  const bytes = epub.resources[path]
  const mime = imageMime(path)
  if (!bytes || !mime) return ''
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

export function parseEpub(input, fileName = '导入的书籍.epub') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length > MAX_ARCHIVE) throw new Error('EPUB 文件不能超过 32 MB')
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('所选文件不是有效的 EPUB')
  let total = 0, resources
  try {
    resources = unzipSync(bytes, { filter: item => {
      total += item.originalSize
      if (item.originalSize > MAX_PART || total > MAX_UNPACKED) throw new Error('EPUB 解压后内容过大')
      return true
    } })
  } catch (error) { throw new Error(error.message?.includes('过大') ? error.message : 'EPUB 文件损坏或无法解压') }
  const container = xml(resources['META-INF/container.xml'], '容器信息')
  const packagePath = attr(first(container.documentElement, 'rootfile'), 'full-path')
  if (!packagePath) throw new Error('EPUB 缺少书籍清单')
  const packageXml = xml(resources[packagePath], '书籍清单')
  const metadata = first(packageXml.documentElement, 'metadata')
  const title = text(first(metadata, 'title')) || fileName.replace(/\.epub$/i, '')
  const author = text(first(metadata, 'creator'))
  const description = text(first(metadata, 'description'))
  const manifest = new Map(descendants(first(packageXml.documentElement, 'manifest'), 'item').map(item => {
    const id = attr(item, 'id')
    return [id, { id, path: resolvePath(packagePath, attr(item, 'href')), mediaType: attr(item, 'media-type'), properties: attr(item, 'properties') }]
  }))
  const spineNode = first(packageXml.documentElement, 'spine')
  const spine = { toc: attr(spineNode, 'toc'), items: descendants(spineNode, 'itemref').map(item => manifest.get(attr(item, 'idref'))).filter(Boolean) }
  const nav = tocEntries(resources, packagePath, manifest, spine)
  const sections = []
  for (const item of spine.items) {
    if (!resources[item.path] || !/xhtml|html/i.test(item.mediaType)) continue
    const blocks = contentBlocks(xml(resources[item.path], item.path), item.path)
    if (!blocks.length) continue
    const entries = nav.filter(entry => entry.path === item.path)
    const splits = entries.filter(entry => entry.fragment && blocks.some(block => block.anchor === entry.fragment))
    const ranges = splits.length > 1 ? splits.map(entry => ({ entry, start: blocks.findIndex(block => block.anchor === entry.fragment) })).sort((a, b) => a.start - b.start) : []
    if (ranges.length && ranges[0].start > 0) ranges.unshift({ entry: entries[0], start: 0 })
    const slices = ranges.length ? ranges.map((range, index) => ({ entry: range.entry, blocks: blocks.slice(range.start, ranges[index + 1]?.start ?? blocks.length) })) : [{ entry: entries[entries.length - 1], blocks }]
    for (const part of slices) {
      if (!part.blocks.length) continue
      const entry = part.entry
      const heading = part.blocks.find(block => block.type === 'heading')?.text || ''
      const chapterTitle = entry?.parent || (entry?.level === 1 ? entry.title : heading || `第 ${sections.length + 1} 章`)
      const articleTitle = entry?.parent ? entry.title : heading && heading !== chapterTitle ? heading : ''
      sections.push({ id: `epub-${sections.length}`, chapterTitle, title: articleTitle, blocks: part.blocks })
    }
  }
  if (!sections.length) throw new Error('EPUB 中没有可阅读的正文')
  const groups = []
  for (const section of sections) {
    let group = groups[groups.length - 1]
    if (!group || group.title !== section.chapterTitle) { group = { title: section.chapterTitle, articles: [] }; groups.push(group) }
    group.articles.push({ id: section.id, title: section.title || section.chapterTitle })
  }
  const coverId = descendants(metadata, 'meta').find(item => attr(item, 'name') === 'cover')?.getAttribute('content')
  const coverItem = manifest.get(coverId) || [...manifest.values()].find(item => item.properties.split(/\s+/).includes('cover-image')) || [...manifest.values()].find(item => /cover/i.test(item.id) && imageMime(item.path))
  const cover = coverItem && resources[coverItem.path]?.length <= 4 * 1024 * 1024 ? epubImageSource({ resources }, coverItem.path) : ''
  return { title, author, description, cover, coverPath: coverItem?.path || '', outline: groups, sections, resources }
}
