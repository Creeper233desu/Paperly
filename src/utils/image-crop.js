const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function centeredCrop(image, ratio = 0) {
  let width = image.width, height = image.height
  if (ratio > 0) {
    width = Math.min(width, height * ratio)
    height = width / ratio
  }
  return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height }
}

export function moveCrop(image, crop, dx, dy) {
  return { ...crop, x: clamp(crop.x + dx, 0, image.width - crop.width), y: clamp(crop.y + dy, 0, image.height - crop.height) }
}

export function resizeCrop(image, crop, corner, dx, dy, ratio = 0) {
  const west = corner.includes('w'), north = corner.includes('n')
  const anchorX = west ? crop.x + crop.width : crop.x, anchorY = north ? crop.y + crop.height : crop.y
  const maxWidth = west ? anchorX : image.width - anchorX, maxHeight = north ? anchorY : image.height - anchorY
  let width = crop.width + (west ? -dx : dx), height = crop.height + (north ? -dy : dy)
  if (ratio > 0) {
    width = Math.abs(dx) >= Math.abs(dy) * ratio ? width : height * ratio
    const limit = Math.min(maxWidth, maxHeight * ratio)
    width = clamp(width, Math.min(32, limit), limit)
    height = width / ratio
  } else {
    width = clamp(width, Math.min(32, maxWidth), maxWidth)
    height = clamp(height, Math.min(32, maxHeight), maxHeight)
  }
  return { x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height }
}

export function fitImage(image, viewport) {
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height)
  const width = image.width * scale, height = image.height * scale
  return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height, scale }
}

export function cropOutputSize(crop, maxEdge = 2560, maxPixels = 4 * 1024 * 1024) {
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height), Math.sqrt(maxPixels / (crop.width * crop.height)))
  return { width: Math.max(1, Math.round(crop.width * scale)), height: Math.max(1, Math.round(crop.height * scale)) }
}
