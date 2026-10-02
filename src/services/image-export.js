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

function imageOpacity(value) {
  const opacity = Number(value)
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : .3
}

function paintBackgroundImage(ctx, layout, image, opacity) {
  if (!image?.path || !opacity) return
  const width = Number(image.width), height = Number(image.height)
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('背景图片尺寸无效，请重新选择图片')
  // Match the preview's aspectFill: crop the center without stretching the image.
  const scale = Math.max(layout.width / width, layout.height / height)
  const cropWidth = layout.width / scale, cropHeight = layout.height / scale
  ctx.setGlobalAlpha(opacity)
  try { ctx.drawImage(image.path, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, layout.width, layout.height) }
  finally { ctx.setGlobalAlpha(1) }
}

export function paintTextImage(ctx, layout, style, { backgroundImage = null, backgroundOpacity = .3 } = {}) {
  const dark = style === 'dark'
  ctx.setGlobalAlpha(1)
  ctx.setFillStyle(dark ? '#171b24' : '#fbfaf7')
  ctx.fillRect(0, 0, layout.width, layout.height)
  paintBackgroundImage(ctx, layout, backgroundImage, imageOpacity(backgroundOpacity))
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

function readBackgroundImage(api, image) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('背景图片读取超时，请重新选择图片')), 8000)
    const fail = () => { clearTimeout(timeout); reject(new Error('无法读取背景图片，请重新选择图片')) }
    try {
      api.getImageInfo({ src: image.path, success: info => {
        clearTimeout(timeout)
        const width = Number(info.width), height = Number(info.height)
        if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return reject(new Error('背景图片尺寸无效，请重新选择图片'))
        resolve({ path: info.path || image.path, width, height })
      }, fail })
    } catch (_) { fail() }
  })
}

export async function createTextPng({ canvasId, instance, text, info = '', style = 'light', backgroundImage = null, backgroundOpacity = .3, fontFamily = '', resize, nextFrame, settle = () => new Promise(resolve => setTimeout(resolve, 80)), api = uni }) {
  const ctx = api.createCanvasContext(canvasId, instance)
  if (!ctx) throw new Error('无法建立图片画布')
  const layout = layoutImageText(ctx, text, info, fontFamily)
  const image = backgroundImage?.path ? await readBackgroundImage(api, backgroundImage) : null
  resize(layout)
  await nextFrame()
  await settle()
  paintTextImage(ctx, layout, style, { backgroundImage: image, backgroundOpacity })
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
