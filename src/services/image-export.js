const WIDTH = 1080
const LEFT = 88
const TEXT_WIDTH = WIDTH - LEFT * 2

export function layoutImageText(ctx, text, info = '') {
  if (!String(text).trim()) throw new Error('请先选择文字')
  ctx.setFontSize(34)
  const lines = []
  for (const paragraph of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    for (const glyph of paragraph) {
      if (line && ctx.measureText(line + glyph).width > TEXT_WIDTH) { lines.push(line); line = glyph }
      else line += glyph
    }
    lines.push(line)
  }
  const top = info ? 218 : 150
  const height = Math.max(460, top + lines.length * 62 + 140)
  if (height > 8000) throw new Error('选中文字过长，请缩小范围后导出')
  return { width: WIDTH, height, top, info, lines }
}

export function paintTextImage(ctx, layout, style) {
  const dark = style === 'dark'
  ctx.setFillStyle(dark ? '#171b24' : '#fbfaf7')
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.setFillStyle(dark ? '#f0eee8' : '#252a32')
  if (layout.info) {
    ctx.setGlobalAlpha(.62)
    ctx.setFontSize(24)
    ctx.fillText(layout.info.slice(0, 48), 88, 93)
    ctx.setGlobalAlpha(1)
    ctx.setFillStyle(dark ? '#657d9f' : '#b6c3d4')
    ctx.fillRect(88, 123, 48, 3)
    ctx.setFillStyle(dark ? '#f0eee8' : '#252a32')
  }
  ctx.setFontSize(34)
  layout.lines.forEach((line, index) => { if (line) ctx.fillText(line, 88, layout.top + index * 62) })
  const foot = layout.height - 67
  ctx.setFillStyle(dark ? '#879fbe' : '#536787')
  ctx.fillRect(88, foot + 10, 40, 2)
  ctx.setFontSize(24)
  ctx.fillText('纸间', 831, foot)
  ctx.setFontSize(15)
  ctx.fillText('PAPERWRITER', 895, foot - 2)
}
