const WIDTH = 1080
const LEFT = 88
const TEXT_WIDTH = WIDTH - LEFT * 2

function setCanvasFont(ctx, size, family) {
  ctx.setFontSize(size)
  if (family) ctx.font = `${size}px ${family}`
}

export function layoutImageText(ctx, text, info = '', fontFamily = '') {
  if (!String(text).trim()) throw new Error('请先选择文字')
  setCanvasFont(ctx, 34, fontFamily)
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
  return { width: WIDTH, height, top, info, lines, fontFamily }
}

export function paintTextImage(ctx, layout, style) {
  const dark = style === 'dark'
  ctx.setFillStyle(dark ? '#171b24' : '#fbfaf7')
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.setFillStyle(dark ? '#f0eee8' : '#252a32')
  if (layout.info) {
    ctx.setGlobalAlpha(.62)
    setCanvasFont(ctx, 24, layout.fontFamily)
    ctx.fillText(layout.info.slice(0, 48), 88, 93)
    ctx.setGlobalAlpha(1)
    ctx.setFillStyle(dark ? '#657d9f' : '#b6c3d4')
    ctx.fillRect(88, 123, 48, 3)
    ctx.setFillStyle(dark ? '#f0eee8' : '#252a32')
  }
  setCanvasFont(ctx, 34, layout.fontFamily)
  layout.lines.forEach((line, index) => { if (line) ctx.fillText(line, 88, layout.top + index * 62) })
  const foot = layout.height - 67
  ctx.setFillStyle(dark ? '#879fbe' : '#536787')
  ctx.fillRect(88, foot + 10, 40, 2)
  setCanvasFont(ctx, 24, layout.fontFamily)
  ctx.fillText('纸间', 831, foot)
  setCanvasFont(ctx, 15, layout.fontFamily)
  ctx.fillText('PAPERWRITER', 895, foot - 2)
}

export async function createTextPng({ canvasId, instance, text, info = '', style = 'light', fontFamily = '', resize, nextFrame, settle = () => new Promise(resolve => setTimeout(resolve, 80)), api = uni }) {
  const ctx = api.createCanvasContext(canvasId, instance)
  if (!ctx) throw new Error('无法建立图片画布')
  const layout = layoutImageText(ctx, text, info, fontFamily)
  resize(layout)
  await nextFrame()
  await settle()
  paintTextImage(ctx, layout, style)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('画布绘制超时')), 8000)
    try { ctx.draw(false, () => { clearTimeout(timeout); resolve() }) }
    catch (error) { clearTimeout(timeout); reject(error) }
  })
  await settle()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('图片导出超时')), 8000)
    api.canvasToTempFilePath({
      canvasId, fileType: 'png', width: layout.width, height: layout.height,
      destWidth: layout.width, destHeight: layout.height,
      success: result => { clearTimeout(timeout); result.tempFilePath ? resolve(result.tempFilePath) : reject(new Error('画布没有返回图片文件')) },
      fail: error => { clearTimeout(timeout); reject(new Error(error?.errMsg || '图片生成失败')) }
    }, instance)
  })
}
