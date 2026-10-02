import { zlibSync } from 'fflate'

const IDENTITY = [1, 0, 0, 1, 0, 0]
const MAX_PIXELS = 4 * 1024 * 1024
const MAX_SIDE = 4096

function multiply([a, b, c, d, e, f], [g, h, i, j, k, l]) {
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]
}
function bounds([a, b, c, d, e, f]) {
  const xs = [e, a + e, c + e, a + c + e], ys = [f, b + f, d + f, b + d + f]
  return { x: Math.min(...xs), right: Math.max(...xs), y: Math.max(...ys), bottom: Math.min(...ys) }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function chunk(type, data) {
  const result = new Uint8Array(data.length + 12), view = new DataView(result.buffer)
  view.setUint32(0, data.length)
  result.set(Array.from(type, char => char.charCodeAt(0)), 4); result.set(data, 8)
  let crc = 0xffffffff
  for (let index = 4; index < result.length - 4; index++) crc = crcTable[(crc ^ result[index]) & 255] ^ (crc >>> 8)
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0)
  return result
}

// PDF.js decodes color spaces and soft masks. Encode its pixels directly so
// older Android WebViews need neither OffscreenCanvas nor ImageBitmap support.
export function encodePdfImage(image, matrix = null, crop = null) {
  const { width: sourceWidth, height: sourceHeight, data, kind } = image || {}
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 || !data) throw new Error('无法读取 PDF 图片')
  const channels = kind === 2 ? 3 : kind === 3 ? 4 : kind === 1 ? 0 : -1
  matrix ||= [sourceWidth, 0, 0, sourceHeight, 0, 0]
  const rowBytes = Math.ceil(sourceWidth / 8)
  if (channels < 0 || data.length < (channels ? sourceWidth * sourceHeight * channels : rowBytes * sourceHeight)) throw new Error('无法读取 PDF 图片')
  const region = crop || { x: 0, y: 0, w: sourceWidth, h: sourceHeight }
  if (![region.x, region.y, region.w, region.h, ...matrix].every(Number.isFinite) || region.w <= 0 || region.h <= 0 || region.x < 0 || region.y < 0 || region.x + region.w > sourceWidth || region.y + region.h > sourceHeight) throw new Error('无法读取 PDF 图片')
  const [a, b, c, d, e, f] = matrix, box = bounds(matrix), det = a * d - b * c
  const boxWidth = box.right - box.x, boxHeight = box.y - box.bottom
  if (!det || !boxWidth || !boxHeight) throw new Error('PDF 图片尺寸无效')
  let scale = Math.max(region.w / Math.hypot(a, b), region.h / Math.hypot(c, d))
  scale = Math.min(scale, MAX_SIDE / boxWidth, MAX_SIDE / boxHeight, Math.sqrt(MAX_PIXELS / (boxWidth * boxHeight)))
  const width = Math.max(1, Math.floor(boxWidth * scale)), height = Math.max(1, Math.floor(boxHeight * scale))
  const stride = width * 4 + 1, pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const py = box.y - (y + .5) * boxHeight / height - f
    for (let x = 0; x < width; x++) {
      const px = box.x + (x + .5) * boxWidth / width - e
      const u = (d * px - c * py) / det, v = (-b * px + a * py) / det
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
      const sx = Math.min(sourceWidth - 1, Math.floor(region.x + u * region.w)), sy = Math.min(sourceHeight - 1, Math.floor(region.y + (1 - v) * region.h))
      const target = y * stride + 1 + x * 4
      if (channels) {
        const source = (sy * sourceWidth + sx) * channels
        pixels[target] = data[source]; pixels[target + 1] = data[source + 1]; pixels[target + 2] = data[source + 2]
        pixels[target + 3] = channels === 4 ? data[source + 3] : 255
      } else {
        const gray = data[sy * rowBytes + (sx >> 3)] & (128 >> (sx & 7)) ? 255 : 0
        pixels[target] = pixels[target + 1] = pixels[target + 2] = gray; pixels[target + 3] = 255
      }
    }
  }
  const header = new Uint8Array(13), view = new DataView(header.buffer)
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(pixels, { level: 3 })), chunk('IEND', new Uint8Array())]
  const png = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) { png.set(part, offset); offset += part.length }
  const binary = []
  for (let index = 0; index < png.length; index += 8192) binary.push(String.fromCharCode(...png.subarray(index, index + 8192)))
  return { dataUrl: `data:image/png;base64,${btoa(binary.join(''))}`, width, height }
}

function imageObject(page, id) {
  const objects = id.startsWith('g_') ? page.commonObjs : page.objs
  if (objects.has(id)) return Promise.resolve(objects.get(id))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取 PDF 图片超时')), 15000)
    objects.get(id, image => { clearTimeout(timer); resolve(image) })
  })
}

export async function extractPdfPageImages(pdfjs, page, number, { onImage = async image => ({ path: image.dataUrl, width: image.width, height: image.height }), checkCancelled = () => {} } = {}) {
  const images = [], warnings = [], ops = pdfjs.OPS
  if (!ops || !page.getOperatorList) return { images, warnings }
  let list
  try { list = await page.getOperatorList() }
  catch (_) { return { images, warnings: [`第 ${number} 页的图片无法提取，已保留可读取的文字。`] } }
  let matrix = [...IDENTITY], skipped = 0
  const stack = [], cache = new Map()
  async function append(source, transform = matrix, crop = null) {
    checkCancelled()
    let encoded
    try {
      if (typeof source === 'string' && !cache.has(source)) cache.set(source, imageObject(page, source))
      const image = typeof source === 'string' ? await cache.get(source) : source
      encoded = encodePdfImage(image, transform, crop)
    } catch (_) { skipped++; return }
    // Saving/bridge errors must abort the import rather than silently lose media.
    checkCancelled()
    const media = await onImage(encoded)
    checkCancelled()
    if (!media?.path) throw new Error('PDF 图片保存失败')
    images.push({ type: 'image', ...bounds(transform), page: number, pageHeight: page.view[3] - page.view[1], media })
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  for (let index = 0; index < list.fnArray.length; index++) {
    checkCancelled()
    const op = list.fnArray[index], args = list.argsArray[index] || []
    if (op === ops.save || op === ops.paintFormXObjectBegin || op === ops.beginGroup) {
      stack.push([...matrix])
      const formMatrix = op === ops.paintFormXObjectBegin ? args[0] : op === ops.beginGroup ? args[0]?.matrix : null
      if (formMatrix) matrix = multiply(matrix, formMatrix)
    } else if (op === ops.restore || op === ops.paintFormXObjectEnd || op === ops.endGroup) matrix = stack.pop() || [...IDENTITY]
    else if (op === ops.transform) matrix = multiply(matrix, args)
    else if (op === ops.paintImageXObject || op === ops.paintInlineImageXObject) await append(args[0])
    else if (op === ops.paintImageXObjectRepeat) {
      const [source, sx, sy, positions] = args
      for (let at = 0; at < positions.length; at += 2) await append(source, multiply(matrix, [sx, 0, 0, sy, positions[at], positions[at + 1]]))
    } else if (op === ops.paintInlineImageXObjectGroup) {
      for (const entry of args[1]) await append(args[0], multiply(matrix, entry.transform), entry)
    } else if (op === ops.paintImageMaskXObject || op === ops.paintImageMaskXObjectGroup || op === ops.paintImageMaskXObjectRepeat) skipped++
  }
  if (skipped) warnings.push(`第 ${number} 页有 ${skipped} 处图片无法提取，已保留可读取的内容。`)
  return { images, warnings }
}
