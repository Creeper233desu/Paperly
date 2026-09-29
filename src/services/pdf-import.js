// PDF.js TextItems -> ordinary editable paragraphs. Kept independent of the
// Android bridge so extraction and layout recovery can be tested with real PDFs.
const chapterPattern = /^(?:第[零〇一二三四五六七八九十百千\d]+[章卷部篇]|chapter\s+\d+(?:\s|[：:·.、-]|$))/i
const sectionPattern = /^(?:第[零〇一二三四五六七八九十百千\d]+节|\d+\.\d+\s)/
const cjk = /[\u2e80-\u9fff\uf900-\ufaff]/

function orderColumns(lines) {
  const gaps = []
  for (let index = 1; index < lines.length; index++) {
    const left = lines[index - 1], right = lines[index]
    if (Math.abs(left.y - right.y) < left.size * .3 && right.x - left.right > left.size * 3) gaps.push([left.right, right.x])
  }
  if (gaps.length < 3) return lines
  const candidates = gaps.map(([left,right]) => (left + right) / 2)
  const gutter = candidates.sort((a,b) => gaps.filter(([l,r]) => l < b && b < r).length - gaps.filter(([l,r]) => l < a && a < r).length)[0]
  if (gaps.filter(([left,right]) => left < gutter && gutter < right).length < 3) return lines
  const result = [], columns = [[], []]
  const flush = () => { result.push(...columns[0], ...columns[1]); columns[0] = []; columns[1] = [] }
  for (const line of lines) {
    if (line.x < gutter && line.right > gutter) { flush(); result.push(line) }
    else { const column = line.x >= gutter ? 1 : 0; columns[column].push({ ...line, column }) }
  }
  flush()
  return result
}

export function pdfTextLines(content, pageNumber, pageHeight = 842) {
  const rows = []
  for (const item of content.items || []) {
    if (!item.str || !item.transform) continue
    const [a, b, , , x, y] = item.transform
    const size = Math.max(1, Math.hypot(a, b) || item.height || 12)
    let row = rows.find(row => Math.abs(row.y - y) < Math.min(row.size, size) * .3)
    if (!row) { row = { y, size, parts: [] }; rows.push(row) }
    row.size = Math.max(row.size, size)
    row.parts.push({ text: item.str, x, width: item.width || 0, size })
  }
  const lines = []
  for (const row of rows.sort((a, b) => b.y - a.y)) {
    const parts = row.parts.sort((a, b) => a.x - b.x)
    let run = null, previous = null
    for (const part of parts) {
      const gap = previous ? part.x - previous.x - previous.width : 0
      // A wide horizontal gap is a new column/table cell, not a giant word.
      if (!run || gap > row.size * 3) {
        run = { text: '', x: part.x, right: part.x, y: row.y, size: row.size, page: pageNumber, pageHeight }
        lines.push(run); previous = null
      }
      if (previous && gap > row.size * .12 && !/\s$/.test(run.text) && !/^\s/.test(part.text) && !(cjk.test(run.text.slice(-1)) && cjk.test(part.text[0]))) run.text += ' '
      run.text += part.text
      run.right = part.x + part.width
      previous = part
    }
  }
  return orderColumns(lines.map(line => ({ ...line, text: line.text.replace(/\u00a0/g, ' ').trim() })).filter(line => line.text))
}

export async function extractPdfDocument(pdfjs, bytes, { onPage = () => {}, onProgress = () => {}, cMapReaderFactory } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data.length < 5 || !String.fromCharCode(...data.subarray(0, 1024)).includes('%PDF-')) throw new Error('所选文件不是有效的 PDF')
  const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true, disableFontFace: true, useWorkerFetch: false,
    ...(cMapReaderFactory ? { CMapReaderFactory: cMapReaderFactory } : {}) })
  let doc
  try {
    doc = await task.promise
    if (!Number.isInteger(doc.numPages) || doc.numPages < 1) throw new Error('无法读取 PDF 页数，请检查文件是否完整')
    const metadata = await doc.getMetadata().catch(() => ({ info: {} }))
    const pages = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const content = await page.getTextContent()
      const lines = pdfTextLines(content, number, page.view[3] - page.view[1])
      pages.push(lines)
      await onPage({ number, total: doc.numPages, lines })
      onProgress({ current: number, total: doc.numPages })
      page.cleanup()
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    return { pages, metadata: { title: metadata.info?.Title || '', author: metadata.info?.Author || '', description: metadata.info?.Subject || '' } }
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('此 PDF 已加密，请先移除密码后导入')
    throw error
  } finally { await task.destroy() }
}

export function buildPdfBook(pages, metadata = {}, fileName = '导入的书籍.pdf') {
  const repeated = new Map()
  for (const lines of pages) {
    const seen = new Set()
    for (const line of lines) {
      if (line.y < line.pageHeight * .08 || line.y > line.pageHeight * .92) seen.add(line.text)
    }
    for (const value of seen) repeated.set(value, (repeated.get(value) || 0) + 1)
  }
  const chapters = []
  let chapter, article, previous, paragraph = ''
  let skippedPages = 0
  function ensureChapter() { if (!chapter) { chapter = { title: '正文', articles: [] }; chapters.push(chapter) } }
  function ensureArticle() {
    ensureChapter()
    if (!article) { article = { title: '', paragraphs: [] }; chapter.articles.push(article) }
  }
  function flush() { if (paragraph.trim()) { ensureArticle(); article.paragraphs.push(paragraph.trim()) }; paragraph = '' }
  for (const page of pages) {
    if (!page.length) { skippedPages++; continue }
    const lines = page.filter(line => {
      const margin = line.y < line.pageHeight * .08 || line.y > line.pageHeight * .92
      return !(margin && (/^[-—\s]*\d+[-—\s]*$/.test(line.text) || (pages.length >= 3 && repeated.get(line.text) >= Math.max(3, Math.ceil(pages.length * .6)))))
    })
    const leftEdges = new Map()
    for (const line of lines) leftEdges.set(line.column || 0, Math.min(leftEdges.get(line.column || 0) ?? Infinity, line.x))
    for (const line of lines) {
      const heading = line.text.length <= 80 && (chapterPattern.test(line.text) ? 1 : sectionPattern.test(line.text) ? 2 : 0)
      if (heading) {
        flush()
        if (heading === 1) { chapter = { title: line.text, articles: [] }; chapters.push(chapter); article = null }
        else { ensureChapter(); article = { title: line.text, paragraphs: [] }; chapter.articles.push(article) }
        previous = null; continue
      }
      const samePage = previous?.page === line.page
      const newColumn = samePage && (line.y >= previous.y - line.size * .4)
      const newParagraph = previous && (newColumn || (samePage && previous.y - line.y > Math.max(previous.size, line.size) * 1.85) || line.x - leftEdges.get(line.column || 0) >= line.size * 1.5 || /[。！？!?：:]\s*[”」』）)]?$/.test(previous.text))
      if (newParagraph) flush()
      if (paragraph && /[a-z0-9,;]$/i.test(paragraph) && /^[a-z0-9]/i.test(line.text)) paragraph += ' '
      paragraph += line.text
      previous = line
    }
    // Bound article size even in a book with no detectable chapter headings.
    if ((article?.paragraphs || []).join('').length + paragraph.length > 16000) { flush(); article = null; previous = null }
  }
  flush()
  if (!chapters.some(group => group.articles.some(item => item.paragraphs.length))) throw new Error('此 PDF 没有可提取的文字，可能是扫描件。请先用 OCR 转成含文字层的 PDF，再导入。')
  return { title: String(metadata.title || fileName.replace(/\.pdf$/i, '')).trim(), author: String(metadata.author || ''), description: String(metadata.description || ''), chapters,
    warnings: skippedPages ? [`${skippedPages} 页没有文字层，未导入这些页的图片内容。`] : [], pageCount: pages.length }
}
