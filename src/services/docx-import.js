import { unzipSync, strFromU8 } from 'fflate'
import { DOMParser } from '@xmldom/xmldom'

const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_XML_BYTES = 24 * 1024 * 1024
const REQUIRED_PARTS = new Set(['word/document.xml', 'word/styles.xml', 'docProps/core.xml'])
const chapterPattern = /^第[零〇一二三四五六七八九十百千\d]+章(?:\s|[：:·.、-]|$)/
const articlePattern = /^第[零〇一二三四五六七八九十百千\d]+节(?:\s|[：:·.、-]|$)/

function children(node) {
  const result = []
  for (let child = node?.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) result.push(child)
  return result
}
function local(node) { return node?.localName || node?.nodeName?.split(':').pop() }
function child(node, name) { return children(node).find(item => local(item) === name) }
function descendants(node, name) {
  const result = []
  function visit(current) { for (const item of children(current)) { if (local(item) === name) result.push(item); visit(item) } }
  visit(node)
  return result
}
function attr(node, name) { return node?.getAttribute(`w:${name}`) || node?.getAttribute(name) || '' }
function parseXml(xml) {
  if (!xml) return null
  const errors = []
  const document = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(message) } }).parseFromString(xml, 'application/xml')
  if (errors.length || local(document.documentElement) === 'parsererror') throw new Error('DOCX 中的 XML 内容无法解析')
  return document
}
function xmlText(node) { return node?.textContent?.trim() || '' }
function metadata(core) {
  const root = core?.documentElement
  const value = name => xmlText(descendants(root, name)[0])
  return { title: value('title'), author: value('creator'), description: value('description') }
}
function styleKinds(styles) {
  const kinds = new Map()
  for (const style of descendants(styles?.documentElement, 'style')) {
    if (attr(style, 'type') !== 'paragraph') continue
    const id = attr(style, 'styleId'), label = attr(child(style, 'name'), 'val')
    const outline = attr(descendants(style, 'outlineLvl')[0], 'val')
    const match = `${id} ${label}`.match(/(?:heading|标题)\s*([12])/i)
    const kind = /^(title|标题)$/i.test(id) || /^(title|标题)$/i.test(label) ? 'title' : match ? `heading${match[1]}` : outline === '0' ? 'heading1' : outline === '1' ? 'heading2' : ''
    if (kind) kinds.set(id, kind)
  }
  return kinds
}
function paragraphText(paragraph) {
  let text = ''
  function visit(node) {
    for (const item of children(node)) {
      const name = local(item)
      if (name === 't') text += item.textContent || ''
      else if (name === 'tab') text += '\t'
      else if (name === 'br' || name === 'cr') text += '\n'
      else if (name !== 'pPr') visit(item)
    }
  }
  visit(paragraph)
  return text.replace(/\u00a0/g, ' ').trim()
}
function paragraphKind(paragraph, kinds) {
  const properties = child(paragraph, 'pPr')
  const style = attr(child(properties, 'pStyle'), 'val')
  const outline = attr(child(properties, 'outlineLvl'), 'val')
  if (outline === '0') return 'heading1'
  if (outline === '1') return 'heading2'
  return kinds.get(style) || (/^heading1$/i.test(style) ? 'heading1' : /^heading2$/i.test(style) ? 'heading2' : /^title$/i.test(style) ? 'title' : '')
}
function bodyParagraphs(document, kinds) {
  const body = descendants(document?.documentElement, 'body')[0]
  if (!body) throw new Error('DOCX 缺少正文内容')
  const result = []
  function visit(node) {
    for (const item of children(node)) {
      if (local(item) === 'p') {
        const text = paragraphText(item)
        if (text) result.push({ text, kind: paragraphKind(item, kinds) })
      } else visit(item)
    }
  }
  visit(body)
  return result
}

export function parseDocx(bytes, fileName = '导入的书籍.docx') {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data.length > MAX_FILE_BYTES) throw new Error('DOCX 文件不能超过 16 MB')
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('所选文件不是有效的 DOCX')
  let archive
  try { archive = unzipSync(data, { filter: item => REQUIRED_PARTS.has(item.name) && item.originalSize <= MAX_XML_BYTES }) }
  catch (_) { throw new Error('DOCX 文件损坏或压缩格式不受支持') }
  if (!archive['word/document.xml']) throw new Error('DOCX 缺少正文内容，或文档过大')
  const read = name => archive[name] ? parseXml(strFromU8(archive[name])) : null
  const details = metadata(read('docProps/core.xml'))
  const paragraphs = bodyParagraphs(read('word/document.xml'), styleKinds(read('word/styles.xml')))
  const titleLine = paragraphs.find(item => item.kind === 'title')?.text || ''
  const chapters = []
  let chapter = null, article = null
  function ensureChapter() { if (!chapter) { chapter = { title: '正文', articles: [] }; chapters.push(chapter) } }
  function ensureArticle() { ensureChapter(); if (!article) { article = { title: '', paragraphs: [] }; chapter.articles.push(article) } }
  for (const item of paragraphs) {
    if (item.kind === 'title') continue
    const isChapter = item.kind === 'heading1' || (item.text.length <= 80 && chapterPattern.test(item.text))
    const isArticle = item.kind === 'heading2' || (item.text.length <= 80 && articlePattern.test(item.text))
    if (isChapter) { chapter = { title: item.text, articles: [] }; chapters.push(chapter); article = null }
    else if (isArticle) { ensureChapter(); article = { title: item.text, paragraphs: [] }; chapter.articles.push(article) }
    else { ensureArticle(); article.paragraphs.push(item.text) }
  }
  if (!chapters.some(item => item.articles.some(entry => entry.paragraphs.length))) throw new Error('DOCX 中没有可导入的正文文字')
  const fallback = String(fileName).replace(/\.docx$/i, '').trim() || '导入的书籍'
  return { title: details.title || titleLine || fallback, author: details.author, description: details.description, chapters }
}

export function importedBookSummary(book) {
  return { chapters: book.chapters.length, articles: book.chapters.reduce((total, chapter) => total + chapter.articles.length, 0), words: book.chapters.reduce((total, chapter) => total + chapter.articles.reduce((count, article) => count + article.paragraphs.join('').replace(/\s/g, '').length, 0), 0) }
}
