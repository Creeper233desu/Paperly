// Android PdfDocument 直接使用系统中文字体，不依赖网络、WebView 打印服务或大体积字库。
import { imageIdFromParagraph } from '../utils/media.js'
const WIDTH = 595, HEIGHT = 842, MARGIN = 56, BOTTOM = 770

function wrapLine(text, paint, maxWidth) {
  if (!text) return ['']
  const lines = []
  let line = ''
  for (const char of text) {
    if (line && paint.measureText(line + char) > maxWidth) { lines.push(line); line = char }
    else line += char
  }
  if (line) lines.push(line)
  return lines
}

function safeName(name) { return (name || '未命名书').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) }

export function exportBookPdf(book, withToc = true) {
  // #ifdef APP-PLUS
  if (plus.os.name !== 'Android') throw new Error('当前仅支持 Android 导出 PDF')
  const PdfDocument = plus.android.importClass('android.graphics.pdf.PdfDocument')
  const Paint = plus.android.importClass('android.graphics.Paint')
  const Typeface = plus.android.importClass('android.graphics.Typeface')
  const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
  const pdf = new PdfDocument()
  const titlePaint = new Paint(3), headingPaint = new Paint(3), bodyPaint = new Paint(3), mutedPaint = new Paint(3)
  const face = Typeface.create('sans-serif', 0)
  ;[titlePaint, headingPaint, bodyPaint, mutedPaint].forEach(p => p.setTypeface(face))
  titlePaint.setTextSize(30); titlePaint.setColor(-15058081)
  headingPaint.setTextSize(20); headingPaint.setColor(-15058081)
  bodyPaint.setTextSize(12); bodyPaint.setColor(-15058081)
  mutedPaint.setTextSize(10); mutedPaint.setColor(-8943463)
  let page = null, canvas = null, y = MARGIN, pageNumber = 0
  function drawText(text, x, baseline, paint) {
    // getCanvas() 返回的是 Native.js InstanceObject；直接 canvas.drawText 在部分
    // Android 基座中没有方法映射。invoke 会按原生签名调用 Canvas.drawText。
    plus.android.invoke(canvas, 'drawText', String(text), x, baseline, paint)
  }
  function newPage() {
    if (page) { pdf.finishPage(page); page = null }
    pageNumber += 1
    const Builder = plus.android.importClass('android.graphics.pdf.PdfDocument$PageInfo$Builder')
    const info = new Builder(WIDTH, HEIGHT, pageNumber).create()
    page = pdf.startPage(info)
    canvas = page.getCanvas()
    y = MARGIN
    drawText(String(pageNumber), WIDTH - MARGIN - 10, HEIGHT - 34, mutedPaint)
  }
  function ensure(height) { if (!page || y + height > BOTTOM) newPage() }
  function draw(text, paint, lineHeight, gap = 0) {
    const lines = wrapLine(String(text), paint, WIDTH - 2 * MARGIN)
    for (const line of lines) { ensure(lineHeight); drawText(line, MARGIN, y, paint); y += lineHeight }
    y += gap
  }
  function drawImage(media) {
    const absolute = media?.path && plus.io.convertLocalFileSystemURL(media.path)
    if (!absolute) throw new Error('正文图片文件已丢失，无法完整导出 PDF')
    const BitmapFactory = plus.android.importClass('android.graphics.BitmapFactory')
    const bitmap = BitmapFactory.decodeFile(absolute)
    if (!bitmap) throw new Error('正文图片无法读取，无法完整导出 PDF')
    try {
      const width = Number(plus.android.invoke(bitmap, 'getWidth'))
      const height = Number(plus.android.invoke(bitmap, 'getHeight'))
      if (!width || !height) throw new Error('正文图片尺寸无效')
      const scale = Math.min((WIDTH - 2 * MARGIN) / width, 470 / height, 1)
      const drawnHeight = Math.max(1, Math.round(height * scale))
      ensure(drawnHeight + 18)
      plus.android.invoke(canvas, 'save')
      try {
        plus.android.invoke(canvas, 'translate', MARGIN, y)
        plus.android.invoke(canvas, 'scale', scale, scale)
        plus.android.invoke(canvas, 'drawBitmap', bitmap, 0, 0, bodyPaint)
      } finally { plus.android.invoke(canvas, 'restore') }
      y += drawnHeight + 18
    } finally { plus.android.invoke(bitmap, 'recycle') }
  }
  try {
    newPage(); y = 205
    draw(book.title || '未命名书', titlePaint, 42)
    if (book.author) { y += 8; draw(book.author, bodyPaint, 24) }
    y += 12; draw('纸间 · 导出于 ' + new Date().toLocaleDateString('zh-CN'), mutedPaint, 18)
    if (withToc) {
      newPage(); draw('目录', headingPaint, 32, 20)
      book.chapters.forEach((chapter, ci) => {
        draw(`${ci + 1}. ${chapter.title}`, bodyPaint, 21, 4)
        chapter.articles.forEach(article => { if (article.title) draw(`    ${article.title}`, mutedPaint, 18) })
        y += 10
      })
    }
    book.chapters.forEach((chapter, ci) => {
      newPage()
      draw(`${ci + 1}. ${chapter.title}`, headingPaint, 32, 20)
      chapter.articles.forEach((article, ai) => {
        if (article.title) { ensure(45); draw(article.title, headingPaint, 30, 12) }
        ;(article.paragraphs || []).forEach(paragraph => {
          const imageId = imageIdFromParagraph(paragraph)
          if (imageId) drawImage(article.images?.[imageId])
          else draw(paragraph || ' ', bodyPaint, 23, 12)
        })
        if (ai < chapter.articles.length - 1) y += 22
      })
    })
    pdf.finishPage(page); page = null
    const path = `_doc/${safeName(book.title)}-${Date.now()}.pdf`
    const directory = plus.io.convertLocalFileSystemURL('_doc/')
    const absolute = `${directory.replace(/\/$/, '')}/${path.slice(5)}`
    const stream = new FileOutputStream(absolute)
    try { pdf.writeTo(stream); stream.flush() } finally { stream.close() }
    return path
  } finally { if (page) pdf.finishPage(page); pdf.close() }
  // #endif
  // #ifndef APP-PLUS
  throw new Error('请在 Android App 中导出 PDF')
  // #endif
}
